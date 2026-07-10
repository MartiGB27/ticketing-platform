# Ticketing Platform — Phase 1 (Core)

A modular monolith built with NestJS + TypeScript + PostgreSQL. This is the
starting point of a distributed ticket-booking system: **Users**,
**Events**, and **Reservations** live in the same process, but organized
into independent modules so they can be split into separate Docker services
in Phase 2 without rewriting the business logic.

## Why this design

- **One module = one future microservice.** `UsersModule`, `EventsModule`,
  and `ReservationsModule` don't reference each other directly:
  `ReservationsModule` doesn't import `EventsService` — it queries the
  `events` table through its own `DataSource` inside the transaction. This
  simulates the boundary that will exist once each domain has its own
  database.
- **`AuthModule` is cross-cutting**: every module that needs to protect
  routes imports it (`JwtAuthGuard`), the same way an API Gateway will
  centralize JWT validation for every other service in Phase 2.
- **Real transactional consistency, not a simulation.**
  `ReservationsService.create()` uses `SELECT ... FOR UPDATE` (a pessimistic
  lock) inside a PostgreSQL transaction. Two concurrent requests trying to
  buy the last available tickets cannot oversell them — you can verify this
  yourself by firing parallel requests with Postman Runner or `curl` with `&`.

  > This is **not yet** the 5-minute Redis lock from Phase 3. Here, the
  > "payment" is confirmed instantly. The Redis lock will be used to
  > *temporarily hold* a ticket without confirming it, which a plain
  > PostgreSQL lock doesn't handle well (it would keep a transaction open
  > for 5 minutes, which is terrible for performance).

## Structure

```
src/
  users/          Registration and profile lookup
  auth/            Login, JWT issuance, guard and Passport strategy
  events/          Event catalog (public reads, protected writes)
  reservations/    "Transactional brain": creates reservations with a pessimistic lock
  common/          Shared decorators and filters (exceptions -> JSON)
  app.module.ts    Global configuration (ConfigModule + TypeOrmModule)
  main.ts          Bootstrap, global ValidationPipe, CORS
```

## Data model

| Table           | Key fields                                                      |
|------------------|-------------------------------------------------------------------|
| `users`          | `email` (unique), `passwordHash` (bcryptjs, never returned by the API) |
| `events`         | `totalTickets`, `availableTickets`, `price`                        |
| `reservations`   | `userId`, `eventId`, `quantity`, `status`, `totalPrice`             |

Reservation `status`: `pending` (not used yet until Phase 3) →
`confirmed` (assigned on creation, since payment is simulated) →
`cancelled` (reserved for when we implement lock expiration).

## Getting started

### 1. Start PostgreSQL

```bash
docker compose up -d
```

This spins up only Postgres (user `ticketing` / password
`ticketing_dev_password` / database `ticketing_db`). In Phase 2 this file
will grow to include Redis, RabbitMQ, and the app containers.

### 2. Configure environment variables

```bash
cp .env.example .env
```

The default values already match `docker-compose.yml`.

### 3. Install dependencies and start the app

```bash
npm install
npm run start:dev
```

The server listens on `http://localhost:3000`. With `synchronize: true`
(development only) TypeORM automatically creates the tables the first time
it starts.

### 4. Test with Postman

Import `postman/ticketing.postman_collection.json`. The collection
automatically saves the `accessToken` after login and the `eventId` after
creating an event, so you can run the requests in order without
copy-pasting anything by hand:

1. `Users -> Register`
2. `Auth -> Login`
3. `Events -> Create event`
4. `Events -> List all events` (public, no token needed)
5. `Reservations -> Create reservation`
6. `Reservations -> My reservations`

### 5. Test concurrency (optional, but the most interesting part)

Create an event with `totalTickets: 2` and fire 3 parallel reservation
requests from the terminal:

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

Expected result: 2 `confirmed` reservations and 1 error 400 saying no
tickets are left. `availableTickets` ends up at `0`, never negative.

## Available routes

| Method | Route                 | Protected | Description                          |
|--------|------------------------|-----------|----------------------------------------|
| POST   | `/users/register`     | No        | Creates a new user                     |
| GET    | `/users/:id`          | No        | Looks up a user                        |
| POST   | `/auth/login`         | No        | Returns a JWT                          |
| GET    | `/auth/me`            | Yes       | Returns the user from the token        |
| POST   | `/events`             | Yes       | Creates an event                       |
| GET    | `/events`             | No        | Lists the catalog                      |
| GET    | `/events/:id`         | No        | Event detail                           |
| POST   | `/reservations`       | Yes       | Creates a reservation (lock + "payment") |
| GET    | `/reservations`       | Yes       | Reservations for the authenticated user |
| GET    | `/reservations/:id`   | Yes       | Reservation detail                     |

## What's left for future phases (not a bug, it's the plan)

- **Phase 2**: split `users`, `events`, and `reservations` into independent
  Docker containers, each with its own `Dockerfile`, and add Redis to
  `docker-compose.yml`.
- **Phase 3**: replace the instant confirmation in `ReservationsService`
  with a `pending` flow backed by a Redis lock (`SET key value NX PX
  300000`), RabbitMQ to notify the notifications service, and an
  idempotency table/key for the payment endpoint.
- **Phase 4**: structured JSON logging, an exported Postman collection
  (already included here as a starting point), and a full architecture
  diagram.

## Project roadmap

This repository evolves on a single `main` branch. Each completed phase is
marked with a Git tag (and a matching GitHub Release with notes) instead of
being duplicated into folders — check the **Releases** page of this repo to
browse the state of the project at the end of each phase.
