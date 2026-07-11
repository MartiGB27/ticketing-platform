import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum ReservationStatus {
  PENDING = 'pending', // provisionally reserved, awaiting payment (Phase 3)
  CONFIRMED = 'confirmed', // payment processed
  CANCELLED = 'cancelled', // expired or cancelled
}

// Note: in the monolith, this entity had `@ManyToOne` relations to User
// and Event, which let TypeORM auto-join and eager-load related rows.
// Now that Users and Events live in different services (with their own
// databases in the general case), we can no longer do a SQL JOIN across
// them — we just keep their ids as plain foreign keys. If we ever need
// the user's name or the event's title alongside a reservation, that's an
// HTTP call to the owning service (or a read-model/cache), not a JOIN.
@Entity('reservations')
export class Reservation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'event_id' })
  eventId: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({
    type: 'enum',
    enum: ReservationStatus,
    default: ReservationStatus.PENDING,
  })
  status: ReservationStatus;

  // Total price frozen at the moment of booking (does not depend on
  // future changes to the event's price).
  @Column({ name: 'total_price', type: 'decimal', precision: 10, scale: 2 })
  totalPrice: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
