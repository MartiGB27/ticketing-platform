# Ticketing Platform — Phase 3 (Queues & Concurrency)

Redis and RabbitMQ stop being decorative. This phase replaces the
instant-confirmation reservation flow from Phases 1-2 with a real
**5-minute seat hold**, adds a fully async **Notifications service**
(the 5th piece of the architecture — no HTTP endpoints at all), and adds
**idempotency** to the payment-simulating endpoint.

## What changed, at a glance

- `POST /reservations` now creates a **PENDING** hold (not an instant
  `CONFIRMED`), backed by a real Redis key with a 5-minute TTL.
- A new `POST /reservations/:id/confirm` endpoint simulates payment.
  It **requires** an `Idempotency-Key` header — send the same key twice
  (a double-click, a retried request) and the second call returns the
  first call's exact result instead of re-running anything.
- If a hold isn't confirmed within 5 minutes, it's released automatically
  — the ticket becomes available again and the reservation is marked
  `CANCELLED`. Two independent mechanisms guarantee this (see below).
- **notifications-service** (new, 5th service): consumes a
  `reservation.confirmed` message from RabbitMQ and sends a confirmation
  email. It has zero HTTP surface — nothing can reach it except messages
  on the queue, exactly as originally specced.

## The 5-minute hold: how it actually works

This is the part worth understanding deeply, since it's the kind of thing
that comes up directly in interviews.

**Creating a hold** (`ReservationsService.create()`): identical
pessimistic-lock Postgres transaction as Phases 1-2 — `SELECT ... FOR
UPDATE` on the event row, decrement `availableTickets`, done. What's new:
the reservation starts as `PENDING` with an `expiresAt` 5 minutes out, and
right after the transaction commits, a Redis key `hold:reservation:{id}`
is set with `PX 300000` (5-minute TTL).

**Releasing an unpaid hold** — deliberately backed by *two* independent
mechanisms, not one:

1. **Reactive (primary): Redis keyspace notifications.** Redis is
   configured with `notify-keyspace-events Ex`, which makes it publish
   the key's name to `__keyevent@0__:expired` the moment a key expires.
   `ReservationExpirySubscriber` listens for that and immediately reverts
   the reservation (`CANCELLED` + ticket count restored). This is
   near-instant — release happens within milliseconds of the 5 minutes
   being up.

2. **Backup (safety net): a 60-second sweep.** Redis pub/sub is
   fire-and-forget. If no subscriber is connected at the *exact* moment a
   key expires (e.g. this service is mid-restart), that notification is
   lost forever — Redis does not queue or replay it. `ReservationExpirySweeper`
   doesn't depend on Redis at all for its own scheduling: every 60
   seconds it asks Postgres directly "which `PENDING` reservations are
   past their `expiresAt`?" and reverts whatever it finds. Worst case, a
   missed hold takes up to ~60s longer to release — but it always gets
   released.

Both mechanisms call the exact same `ReservationLockService.revertIfStillPending()`,
which re-checks the reservation's status before doing anything — so it's
safe if both somehow fire for the same reservation (whichever runs first
wins; the second is a no-op).

**This was verified for real, not just written and hoped to work:**
created a hold, killed `reservations-service` before its Redis key could
expire (so the pub/sub notification fired into the void), confirmed the
key was gone from Redis while Postgres still said `PENDING`, restarted
the service, and watched the sweeper catch it exactly as designed.

## Idempotency, concretely

Modeled after Stripe's `Idempotency-Key` header convention.
`POST /reservations/:id/confirm` requires it — there's no optional
fallback, since silently allowing an un-keyed request on a
payment-simulating endpoint would defeat the point.

- **First request with a given key**: processed normally, and the result
  is cached in Redis (24h TTL) against that key.
- **Same key, sent again after the first finished**: returns the exact
  cached result. No RabbitMQ message is published a second time, no
  re-processing happens at all.
- **Same key, sent again *while the first is still processing*** (a
  genuine race — two near-simultaneous requests): the second gets
  `409 Conflict` rather than being queued or silently duplicated.

All three cases were tested with real concurrent `curl` requests — see
`CHANGELOG.md` for the exact scenarios.

## notifications-service: the async piece

Structurally different from the other three backend services: it's
bootstrapped with `NestFactory.createMicroservice()`, not `.create()` —
there is no HTTP server, no port, nothing for the Gateway to route to.
The only way in is a message on the `reservations_events_queue` RabbitMQ
queue.

- `reservations-service` publishes via `ClientProxy.emit('reservation.confirmed', payload)`
  — fire-and-forget, no reply expected.
- `notifications-service` consumes via `@EventPattern('reservation.confirmed')`,
  with **manual acknowledgment**: the message is only ack'd after the
  email attempt succeeds. If it throws (e.g. the email API is briefly
  down), the message is nack'd and requeued — at-least-once delivery, not
  "fire and hope."
- The `EventRef` entity in `reservations-service` was extended with
  `name`/`venue`/`eventDate` so the outgoing message is fully
  self-contained. notifications-service never calls another service over
  HTTP to enrich the message — that would reintroduce a synchronous
  dependency into an otherwise fully decoupled flow.

**Sending real email**: uses [Resend](https://resend.com)'s HTTP API
directly (no SDK, just `fetch`). If `RESEND_API_KEY` isn't set, it falls
back to logging exactly what it would have sent — the entire
RabbitMQ → consume → "send" pipeline is fully testable with zero external
accounts. To send real email: sign up for a free Resend account, grab an
API key, set `RESEND_API_KEY` in the root `.env`. **This part hasn't been
tested with a real Resend account** — that account doesn't exist yet, so
that's on you to verify once you've signed up.

## Structure additions

```
services/
  notifications-service/     NEW — pure RabbitMQ consumer, zero HTTP
  reservations-service/
    src/redis/                NEW — Redis client + subscriber providers
    src/messaging/             NEW — RabbitMQ ClientProxy registration
    src/reservations/
      reservation-lock.service.ts       NEW — hold creation/release logic
      reservation-expiry.subscriber.ts  NEW — reactive Redis pub/sub listener
      reservation-expiry.sweeper.ts     NEW — 60s backup sweep
      idempotency.service.ts            NEW — generic Redis-backed idempotency
```

## Running it

```bash
cp .env.example .env
docker compose up --build
```

New in this phase's `docker-compose.yml`:
- `redis` now runs with `command: redis-server --notify-keyspace-events Ex`
  and has a healthcheck.
- `rabbitmq` (new): AMQP on `5672`, management UI at
  `http://localhost:15672` (guest/guest) — useful for watching the queue
  fill and drain in real time while testing.
- `notifications-service` (new): no published ports.
- `reservations-service` now depends on `redis` and `rabbitmq` being
  healthy, in addition to `postgres`.

> **Moving from a Phase 2 Postgres volume?** The `reservations` table
> gained an `expires_at` column. Same advice as last time: if
> `reservations-service` fails to start with a schema error, run
> `docker compose down -v && docker compose up --build` to start with a
> clean volume.

### Testing the full flow

```bash
TOKEN="..."          # from POST /auth/login
EVENT_ID="..."       # from POST /events

# 1. Create a hold — note status is "pending", not "confirmed"
curl -s -X POST http://localhost:3000/reservations \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d "{\"eventId\":\"$EVENT_ID\",\"quantity\":1}"
# -> copy the returned "id" as RESERVATION_ID

# 2. Confirm within 5 minutes (Idempotency-Key required)
curl -s -X POST http://localhost:3000/reservations/RESERVATION_ID/confirm \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: $(uuidgen)"

# 3. Re-send the EXACT same Idempotency-Key — should return the same
#    result instantly, no reprocessing
curl -s -X POST http://localhost:3000/reservations/RESERVATION_ID/confirm \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: PASTE_THE_SAME_KEY_FROM_STEP_2"
```

To see the 5-minute expiry in action without waiting 5 minutes for a
demo, watch `docker compose logs -f reservations-service` after creating
a hold you don't confirm — you'll see `ReservationExpirySubscriber` fire
right at the 5-minute mark.

Check `http://localhost:15672` (RabbitMQ management UI) to watch
`reservations_events_queue` while confirming reservations — you'll see
the message count tick up and back down as notifications-service
consumes it.

## What's left for Phase 4

- Structured JSON logging across all 5 services.
- Exported Postman collection (already here, kept up to date each phase).
- Full architecture diagram covering the Gateway, all 4 backend/async
  services, Postgres, Redis, and RabbitMQ.

## Project roadmap

This repository evolves on a single `main` branch. Each completed phase is
marked with a Git tag and a matching GitHub Release — check the
**Releases** page to browse the code as it stood at the end of each phase.
