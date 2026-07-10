import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { Reservation } from '../../reservations/entities/reservation.entity';

@Entity('events')
export class Event {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column()
  venue: string;

  @Column({ name: 'event_date', type: 'timestamptz' })
  eventDate: Date;

  @Column({ name: 'total_tickets', type: 'int' })
  totalTickets: number;

  // Tickets not yet reserved. In Phase 3 this field will combine
  // with Redis temporary locks to prevent overselling.
  @Column({ name: 'available_tickets', type: 'int' })
  availableTickets: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: string; // TypeORM returns 'decimal' as a string to avoid precision loss

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => Reservation, (reservation) => reservation.event)
  reservations: Reservation[];
}
