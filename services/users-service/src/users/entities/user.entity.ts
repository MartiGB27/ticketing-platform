import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

// Note: this entity no longer has a `reservations` relation. In the
// monolith, User had a direct TypeORM relation to Reservation. Now that
// Reservations lives in its own service, this service has no knowledge of
// that table at all — the relationship only exists implicitly through the
// `userId` foreign key stored on the reservations side.
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  // Never return this field to the client (select: false)
  @Column({ select: false })
  passwordHash: string;

  @Column()
  name: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
