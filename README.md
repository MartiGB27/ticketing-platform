# Ticketing Platform — Phase 2 (Dockerization & Separation)

The Phase 1 modular monolith has been split into four independently
deployable pieces: an **API Gateway** and three backend services
(**Users**, **Events**, **Reservations**), each running in its own Docker
container. Redis has been added to `docker-compose.yml`, provisioned and
ready, though no service code uses it yet — that's Phase 3.

From the client's point of view, **nothing changed**: same base URL
(`http://localhost:3000`), same routes, same request/response shapes. The
Postman collection from Phase 1 still works unmodified. Everything below
is about what changed *behind* that URL.

## Structure

```
ticketing-platform/
  docker-compose.yml          Orchestrates everything: postgres, redis, 4 app containers
  .env.example                 Shared secrets used by docker-compose.yml
  gateway/                     Single entry point (plain Express, not NestJS — see below)
  services/
    users-service/             Registration, login, JWT issuance (owns the `users` table)
    events-service/             Event catalog (owns the `events` table)
    reservations-service/       Transactional core (owns `reservations`, reads/locks `events`)
  postman/
    ticketing.postman_collection.json
```

Each service under `services/` is a fully standalone NestJS project — its
own `package.json`, `node_modules`, `Dockerfile`. There's no shared npm
package between them yet. For 3 small services, duplicating ~30 lines of
JWT-verification code across `events-service` and `reservations-service`
is a deliberate, explicit trade-off: you can read exactly what each
service does with no indirection. A larger system would extract that into
a shared internal package.

## Architecture decisions worth knowing for an interview

**1. The Gateway is intentionally thin — plain Express, not NestJS.**
Its whole job is: route by path prefix, and reject obviously-bad JWTs
before wasting a network hop. Pulling in all of Nest for that would be
overkill. See `gateway/src/main.ts` and `gateway/src/routes.ts`.

**2. JWT validation is layered (defense in depth), not gateway-only.**
The Gateway does a *fail-fast* check: if an `Authorization` header is
present, it verifies the signature and expiry immediately and rejects
with 401 before proxying if it's invalid. It does **not** decide which
routes need auth — that stays with each service's own `JwtAuthGuard`,
exactly like Phase 1. Proven in testing: hitting `events-service` directly
on its own port, completely bypassing the Gateway, still returns 401 for
protected routes without a valid token.

**3. Events and Reservations verify JWTs statelessly — no DB lookup.**
In the monolith, `JwtStrategy.validate()` looked the user up via
`UsersService`. Now that Users lives in a different service (with its own
database in the general case), Events/Reservations can't do that lookup
— and shouldn't, since reaching into another service's database defeats
the point of separating them. They now trust the signed JWT payload
directly. Trade-off: if `users-service` needed to revoke a token before
it expires, Events/Reservations wouldn't know until the token's own
expiry. Only `users-service` and the Gateway hold `JWT_SECRET` for signing
purposes; Events/Reservations only need it to verify.

**4. Reservations still reads/writes the `events` table directly.**
`reservations-service` has its own trimmed `EventRef` entity mapped to
the same physical `events` table, decorated with
`@Entity('events', { synchronize: false })` so it can run the exact same
`SELECT ... FOR UPDATE` pessimistic-lock transaction as Phase 1 — without
ever being allowed to alter a table it doesn't own the schema of. This
only works because both services still point at the same Postgres
instance for now. True database-per-service would mean solving
cross-service ticket-availability coordination some other way — which is
exactly what Phase 3's Redis distributed lock introduces. We're
deliberately not solving that problem twice.

## Running it

### 1. Configure secrets

```bash
cp .env.example .env
```

### 2. Build and start everything

```bash
docker compose up --build
```

First run will take a bit longer (building 4 images). Subsequent runs are
fast unless you change a `Dockerfile` or dependencies.

> **If you're moving to Phase 2 in the same Postgres volume you used for
> Phase 1:** the `reservations` table's shape changed slightly (no more
> foreign-key relations, see below), and `synchronize: true` can fail to
> auto-migrate an existing table with existing rows. If `reservations-service`
> fails to start with a column/constraint error, run:
> ```bash
> docker compose down -v
> docker compose up --build
> ```
> This wipes the Postgres volume and lets every service create its schema
> fresh. You'll lose any test data from Phase 1, which is expected — this
> is exactly what a fresh Phase 2 deployment would do anyway.

### 3. Test with Postman

Import `postman/ticketing.postman_collection.json`. Same flow as Phase 1:
`Register → Login → Create event → Create reservation`. A `Gateway →
Health check` request has been added.

### 4. Verify service separation for yourself

Each backend service is also reachable directly on its host-mapped port,
for debugging:

| Service               | Via Gateway (client-facing) | Direct (debugging only) |
|------------------------|------------------------------|---------------------------|
| Gateway                | `http://localhost:3000`     | — |
| users-service          | `http://localhost:3000/users`, `/auth` | `http://localhost:3001` |
| events-service         | `http://localhost:3000/events` | `http://localhost:3002` |
| reservations-service   | `http://localhost:3000/reservations` | `http://localhost:3003` |

Try hitting `http://localhost:3002/events` (POST, no token) directly —
you'll still get a 401 from `events-service`'s own guard, proving it
doesn't blindly trust the Gateway.

### 5. Re-run the concurrency test from Phase 1

Same test, same expected result — now proving the pessimistic lock still
holds with `reservations-service` running as a fully separate container:

```bash
TOKEN="your_token"
EVENT_ID="the_event_id"

for i in 1 2 3; do
  curl -s -X POST http://localhost:3000/reservations \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"eventId\":\"$EVENT_ID\",\"quantity\":1}" &
done
wait
```

### Running a single service standalone (fast iteration)

You don't need to rebuild all of Docker Compose to iterate on one
service. Each one has its own `.env.example` for running outside Docker:

```bash
cd services/events-service
cp .env.example .env   # DB_HOST=localhost, points at the Dockerized Postgres via its host port
npm install
npm run start:dev
```

## What's left for future phases

- **Phase 3**: Redis-based distributed lock for the 5-minute seat hold,
  RabbitMQ + a Notifications service, real idempotency on the payment
  endpoint.
- **Phase 4**: structured JSON logging, exported Postman collection
  (already here), full architecture diagram.

## Project roadmap

This repository evolves on a single `main` branch. Each completed phase is
marked with a Git tag and a matching GitHub Release — check the
**Releases** page to browse the code as it stood at the end of each phase.
