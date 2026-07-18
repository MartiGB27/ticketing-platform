import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { Reservation, ReservationStatus } from './entities/reservation.entity';
import { EventRef } from './entities/event-ref.entity';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { ReservationLockService } from './reservation-lock.service';
import { IdempotencyService } from './idempotency.service';
import { NOTIFICATIONS_CLIENT } from '../messaging/messaging.module';
import { ReservationConfirmedEvent } from '../messaging/reservation-confirmed.event';

const HOLD_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const CONFIRM_IDEMPOTENCY_SCOPE = 'confirm-reservation';

@Injectable()
export class ReservationsService {
  constructor(
    @InjectRepository(Reservation)
    private readonly reservationsRepository: Repository<Reservation>,
    @InjectRepository(EventRef)
    private readonly eventRefRepository: Repository<EventRef>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly reservationLockService: ReservationLockService,
    private readonly idempotencyService: IdempotencyService,
    @Inject(NOTIFICATIONS_CLIENT)
    private readonly notificationsClient: ClientProxy,
  ) {}

  /**
   * PHASE 3 — creates a PENDING hold, not an instant confirmation.
   *
   * Same pessimistic-lock transaction as Phases 1-2 to decrement
   * `availableTickets` safely under concurrency — that part hasn't
   * changed and doesn't need to. What's new: the reservation starts as
   * PENDING with a 5-minute `expiresAt`, and a matching Redis key with a
   * real TTL is created right after the transaction commits. The client
   * must call `confirm()` within that window or the hold is released
   * automatically (see ReservationExpirySubscriber / Sweeper).
   */
  async create(
    userId: string,
    dto: CreateReservationDto,
  ): Promise<Reservation> {
    const reservation = await this.dataSource.transaction(async (manager) => {
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
      const expiresAt = new Date(Date.now() + HOLD_DURATION_MS);

      const newReservation = reservationRepo.create({
        userId,
        eventId: event.id,
        quantity: dto.quantity,
        totalPrice,
        status: ReservationStatus.PENDING,
        expiresAt,
      });

      return reservationRepo.save(newReservation);
    });

    // Outside the Postgres transaction on purpose — Redis isn't part of
    // it and never can be. See createHold()'s doc comment for what
    // happens if this fails.
    await this.reservationLockService.createHold(
      reservation.id,
      reservation.quantity,
    );

    return reservation;
  }

  /**
   * Simulates the payment step. Requires an Idempotency-Key: if the exact
   * same key is sent twice (double-click, retried request after a
   * timeout), the second call returns the first call's result without
   * re-running any of the logic below — no double-charge, no duplicate
   * RabbitMQ message.
   */
  async confirm(
    reservationId: string,
    userId: string,
    userEmail: string,
    idempotencyKey: string,
  ): Promise<Reservation> {
    const outcome = await this.idempotencyService.claim<Reservation>(
      CONFIRM_IDEMPOTENCY_SCOPE,
      idempotencyKey,
    );

    if (outcome.status === 'cached') {
      return outcome.value;
    }
    if (outcome.status === 'in-progress') {
      throw new ConflictException(
        'A request with this Idempotency-Key is already being processed',
      );
    }

    try {
      const result = await this.doConfirm(reservationId, userId, userEmail);
      await this.idempotencyService.store(
        CONFIRM_IDEMPOTENCY_SCOPE,
        idempotencyKey,
        result,
      );
      return result;
    } catch (err) {
      // A genuine failure shouldn't permanently block retries with this
      // same key for the next 24h.
      await this.idempotencyService.release(
        CONFIRM_IDEMPOTENCY_SCOPE,
        idempotencyKey,
      );
      throw err;
    }
  }

  private async doConfirm(
    reservationId: string,
    userId: string,
    userEmail: string,
  ): Promise<Reservation> {
    const reservation = await this.reservationsRepository.findOne({
      where: { id: reservationId },
    });

    if (!reservation) {
      throw new NotFoundException('Reservation not found');
    }
    if (reservation.userId !== userId) {
      throw new ForbiddenException('This reservation does not belong to you');
    }
    if (reservation.status !== ReservationStatus.PENDING) {
      throw new BadRequestException(
        `Reservation is not pending (current status: ${reservation.status})`,
      );
    }
    // Belt-and-suspenders: even if the Redis expiry + sweeper haven't
    // caught up yet, don't let a request that arrives after the hold
    // window succeed.
    if (reservation.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        'This hold has expired — please create a new reservation',
      );
    }

    await this.reservationLockService.clearHold(reservation.id);

    reservation.status = ReservationStatus.CONFIRMED;
    const saved = await this.reservationsRepository.save(reservation);

    const event = await this.eventRefRepository.findOne({
      where: { id: saved.eventId },
    });

    const payload: ReservationConfirmedEvent = {
      reservationId: saved.id,
      userId: saved.userId,
      userEmail,
      eventId: saved.eventId,
      eventName: event?.name ?? 'Unknown event',
      eventVenue: event?.venue ?? '',
      eventDate: event?.eventDate ? event.eventDate.toISOString() : '',
      quantity: saved.quantity,
      totalPrice: saved.totalPrice,
      confirmedAt: new Date().toISOString(),
    };

    // Fire-and-forget: reservations-service does not wait for, or care
    // about, whether notifications-service is even running right now.
    this.notificationsClient.emit('reservation.confirmed', payload);

    return saved;
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
