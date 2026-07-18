import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

/**
 * This is NOT the authoritative Event entity — that lives in
 * events-service. This is a trimmed, read/write-for-locking-purposes-only
 * view of the same physical `events` table, used for the pessimistic-lock
 * transaction below AND to build a self-contained notification message
 * (name/venue/date) without notifications-service ever needing to call
 * events-service over HTTP — that would reintroduce a synchronous
 * dependency into an otherwise fully async, decoupled flow.
 *
 * `synchronize: false` is critical here: this service must never let
 * TypeORM alter the `events` table's schema, since it doesn't own it and
 * only knows about a subset of its columns. events-service remains the
 * only service responsible for creating/migrating that table.
 *
 * Phase 2 still shares one Postgres instance across services, so this
 * direct table access works today. True database-per-service would mean
 * solving cross-service data needs some other way (an HTTP call, a
 * read-model synced via events, etc.) — a bigger step than this project
 * takes on for now.
 */
@Entity('events', { synchronize: false })
export class EventRef {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  venue: string;

  @Column({ name: 'event_date', type: 'timestamptz' })
  eventDate: Date;

  @Column({ name: 'available_tickets', type: 'int' })
  availableTickets: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: string;
}
