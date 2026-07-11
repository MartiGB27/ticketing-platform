import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Reservation, ReservationStatus } from './entities/reservation.entity';
import { EventRef } from './entities/event-ref.entity';
import { CreateReservationDto } from './dto/create-reservation.dto';

@Injectable()
export class ReservationsService {
  constructor(
    @InjectRepository(Reservation)
    private readonly reservationsRepository: Repository<Reservation>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * PHASE 2 — same "transactional brain" logic as Phase 1, now running in
   * its own service/container.
   *
   * Consistency guaranteed at the database level: we use a pessimistic
   * lock (`SELECT ... FOR UPDATE`) on the `events` row within a
   * transaction, so two concurrent requests can never read the same
   * `availableTickets` value and oversell tickets. This still works
   * because reservations-service and events-service currently share the
   * same physical Postgres instance (see EventRef's doc comment).
   *
   * What this version does NOT do yet (coming in Phase 3):
   *  - A 5-minute temporary hold before payment (Redis + TTL).
   *  - Automatically releasing the ticket if payment isn't completed.
   *  - Real idempotency with an Idempotency-Key.
   *
   * Here, for simplicity, the "simulated payment" is confirmed instantly.
   */
  async create(
    userId: string,
    dto: CreateReservationDto,
  ): Promise<Reservation> {
    return this.dataSource.transaction(async (manager) => {
      const eventRepo = manager.getRepository(EventRef);
      const reservationRepo = manager.getRepository(Reservation);

      const event = await eventRepo
        .createQueryBuilder('event')
        .setLock('pessimistic_write')
        .where('event.id = :id', { id: dto.eventId })
        .getOne();

      if (!event) {
        throw new NotFoundException('Event not found');
      }

      if (event.availableTickets < dto.quantity) {
        throw new BadRequestException(
          `Only ${event.availableTickets} tickets available`,
        );
      }

      event.availableTickets -= dto.quantity;
      await eventRepo.save(event);

      const totalPrice = (Number(event.price) * dto.quantity).toFixed(2);

      const reservation = reservationRepo.create({
        userId,
        eventId: event.id,
        quantity: dto.quantity,
        totalPrice,
        // We simulate the payment as instantly confirmed.
        // In Phase 3, this will start as PENDING with a TTL in Redis.
        status: ReservationStatus.CONFIRMED,
      });

      return reservationRepo.save(reservation);
    });
  }

  async findAllForUser(userId: string): Promise<Reservation[]> {
    return this.reservationsRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Reservation> {
    const reservation = await this.reservationsRepository.findOne({
      where: { id },
    });
    if (!reservation) {
      throw new NotFoundException('Reservation not found');
    }
    return reservation;
  }
}
