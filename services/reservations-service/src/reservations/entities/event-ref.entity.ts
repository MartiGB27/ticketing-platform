import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

/**
 * This is NOT the authoritative Event entity — that lives in
 * events-service. This is a trimmed, read/write-for-locking-purposes-only
 * view of the same physical `events` table, used exclusively for the
 * pessimistic-lock transaction below.
 *
 * `synchronize: false` is critical here: this service must never let
 * TypeORM alter the `events` table's schema, since it doesn't own it and
 * only knows about a subset of its columns. events-service remains the
 * only service responsible for creating/migrating that table.
 *
 * Phase 2 still shares one Postgres instance across services, so this
 * direct table access works today. The real fix — coordinating ticket
 * availability across service boundaries without touching another
 * service's table — arrives in Phase 3 with the Redis-based distributed
 * lock.
 */
@Entity('events', { synchronize: false })
export class EventRef {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'available_tickets', type: 'int' })
  availableTickets: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: string;
}
