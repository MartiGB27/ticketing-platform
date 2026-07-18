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

## [Phase 3] - Queues & Concurrency

Redis and RabbitMQ go from provisioned-but-unused to load-bearing.

### Added
- **5-minute seat hold**: `POST /reservations` now creates a `PENDING`
  reservation with a matching Redis key (`hold:reservation:{id}`, TTL
  300s) instead of confirming instantly.
- **`POST /reservations/:id/confirm`**: simulates payment. Requires an
  `Idempotency-Key` header (modeled on Stripe's convention); rejects with
  400 if missing.
- **`ReservationLockService`**: creates/clears the Redis hold key and
  contains the single, idempotent `revertIfStillPending()` used by both
  release mechanisms below.
- **`ReservationExpirySubscriber`**: reactive release via Redis keyspace
  notifications (`notify-keyspace-events Ex`), subscribed to
  `__keyevent@0__:expired`.
- **`ReservationExpirySweeper`**: backup release via a 60-second
  `@Interval()` sweep over Postgres, independent of Redis — covers the
  case where a keyspace notification is fired while no subscriber is
  connected (fire-and-forget pub/sub, not queued/replayed by Redis).
- **`IdempotencyService`**: generic Redis-backed claim/cache/release
  helper, reused for the confirm endpoint's idempotency guarantee.
- **`EventRef` extended** with `name`, `venue`, `eventDate` so
  reservations-service can build a fully self-contained notification
  message without an HTTP call to events-service.
- **notifications-service** (new, 5th service): pure RabbitMQ consumer
  bootstrapped via `NestFactory.createMicroservice()` — no HTTP port at
  all. Listens on `reservations_events_queue`, handles
  `reservation.confirmed` via `@EventPattern`, manually acks only after
  a successful send (nacks + requeues on failure).
- **Email delivery**: `ResendEmailProvider` (real, via Resend's HTTP API)
  and `ConsoleEmailProvider` (dry-run, logs instead of sending) behind a
  shared `EmailProvider` interface — picked automatically based on
  whether `RESEND_API_KEY` is set.
- `rabbitmq` service added to `docker-compose.yml` (management UI on
  `15672`), `redis` now runs with keyspace notifications enabled and has
  a healthcheck.
- Reservation entity gained an `expires_at` column.

### Changed
- `ReservationsService.create()` no longer confirms instantly — see
  "Added" above. The pessimistic-lock Postgres transaction itself is
  unchanged from Phases 1-2.

### Verified (real integration testing, not just unit-level)
- Full hold → confirm → RabbitMQ → notifications-service → dry-run email
  flow, end to end.
- Idempotency, all three cases with real concurrent `curl` requests:
  fresh key (processes normally), same key replayed after completion
  (returns cached result, zero reprocessing — confirmed via consumer log
  count), same key sent twice *simultaneously* (one gets 201, the other
  409).
- Ownership check: a second user attempting to confirm someone else's
  reservation gets 403.
- Confirming an already-expired hold is rejected (400) even if cleanup
  hasn't run yet — explicit `expiresAt` check in `doConfirm()`.
- **Reactive expiry**: created a hold, left it unconfirmed, watched
  `ReservationExpirySubscriber` release it within ~1s of the TTL firing,
  ticket count restored.
- **Backup sweep, specifically the failure case it exists for**: created
  a hold, killed reservations-service *before* the Redis key expired (so
  the subscriber couldn't react), confirmed the key expired from Redis
  while Postgres still said `PENDING` (proving the notification was
  genuinely missed), restarted the service, and watched
  `ReservationExpirySweeper` catch and revert it on its next pass.

### Known limitations (by design — addressed in later phases)
- No structured JSON logging yet — still default Nest console logging.
- **Real email delivery via Resend**: confirmed against a live account —
  `ResendEmailProvider`'s HTTP call succeeds and the confirmation email
  actually arrives in the recipient's inbox, not just the dry-run path.

---

## [Unreleased] - Phase 4 (planned)

- Structured JSON logging across all 5 services.
- Full architecture diagram.
- Exported Postman collection (already tracked here each phase).
