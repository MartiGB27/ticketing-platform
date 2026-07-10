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

## [Unreleased] - Phase 2 (planned)

- Split `users`, `events`, and `reservations` into independent Docker
  services, each with its own `Dockerfile`.
- Add Redis to `docker-compose.yml`.
