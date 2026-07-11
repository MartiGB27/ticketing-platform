# Changelog

All notable changes to this project are documented in this file, grouped
by development phase. Each phase below corresponds to a Git tag — see the
**Releases** page of this repository for the full notes and to browse the
code as it stood at the end of each phase.

## [Phase 1] - Core (Users, Events, Reservations)

Modular monolith built with NestJS, TypeORM, and PostgreSQL.

### Added
- `UsersModule`: registration and profile lookup, with `bcryptjs` password
  hashing.
- `AuthModule`: login with email/password, JWT issuance and validation via
  Passport, `JwtAuthGuard` reusable across protected routes.
- `EventsModule`: public event catalog (read) and protected event creation
  (write).
- `ReservationsModule`: transactional reservation creation using a
  PostgreSQL pessimistic lock (`SELECT ... FOR UPDATE`) to prevent
  overselling tickets under concurrent requests.
- Global `ValidationPipe` with `class-validator` DTOs on every endpoint.
- Global exception filter returning a consistent JSON error shape.
- `docker-compose.yml` with a PostgreSQL 16 service for local development.
- Postman collection covering the full register → login → create event →
  reserve flow, with auto-saved tokens/IDs between requests.

### Known limitations (by design — addressed in later phases)
- Payment is simulated and confirmed instantly; no 5-minute hold yet.
- No idempotency key on the reservation endpoint yet.
- Single process — not yet split into independent services/containers.

---

## [Phase 2] - Dockerization & Separation

The modular monolith is split into four independently deployable pieces,
each running in its own Docker container.

### Added
- **API Gateway** (`gateway/`): plain Express service acting as the single
  client-facing entry point. Routes requests by path prefix to the
  correct backend service and performs a fail-fast JWT signature/expiry
  check before proxying.
- **users-service**: registration, login, and JWT issuance — carried over
  from the monolith's `UsersModule` + `AuthModule`, now standalone.
- **events-service**: event catalog — carried over from `EventsModule`,
  now with stateless JWT verification (no dependency on the users
  database).
- **reservations-service**: the transactional core — carried over from
  `ReservationsModule`, now with stateless JWT verification and a trimmed
  `EventRef` entity (`synchronize: false`) so it can keep running the same
  pessimistic-lock transaction against the shared `events` table without
  owning that table's schema.
- Redis added to `docker-compose.yml` (provisioned, not yet used by any
  service — wired up in Phase 3).
- PostgreSQL healthcheck (`pg_isready`) in `docker-compose.yml`, with
  `depends_on: condition: service_healthy` on every app service.
- `gateway/health` endpoint for basic liveness checking.
- Root `.env.example` consumed by `docker-compose.yml`; each service also
  keeps its own `.env.example` for standalone (`npm run start:dev`)
  iteration outside Docker.

### Changed
- JWT validation is now stateless in events-service and
  reservations-service: they trust the signed payload instead of looking
  the user up via a shared `UsersService` (which no longer exists in their
  process).
- `Reservation` entity no longer has `@ManyToOne` relations to `User` or
  `Event` — those are different services now. `userId`/`eventId` remain
  as plain foreign-key-shaped columns, with no SQL-level `JOIN` possible
  across service boundaries.

### Verified
- Full register → login → create event → reserve flow through the
  Gateway, using the exact same base URL and routes as Phase 1.
- Concurrency: 3 simultaneous reservation requests against 1 remaining
  ticket still resolve to exactly 1 success + 2 rejections, with
  `reservations-service` running as a separate process from
  `events-service`.
- Gateway rejects a JWT with a bad signature (401) before proxying.
- Defense in depth: `events-service` hit directly on its own port,
  bypassing the Gateway entirely, still returns 401 for an unauthenticated
  protected request.

### Known limitations (by design — addressed in later phases)
- Events and Reservations still share one physical Postgres instance.
- No Redis-backed 5-minute hold yet — payment is still instant.
- No idempotency key on the reservation endpoint yet.

---

## [Unreleased] - Phase 3 (planned)

- Redis-based distributed lock for the 5-minute seat hold.
- RabbitMQ + a Notifications service (async, queue-driven).
- Real idempotency on the payment/reservation endpoint.
