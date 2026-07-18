import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';
import { Reservation, ReservationStatus } from './entities/reservation.entity';
import { EventRef } from './entities/event-ref.entity';

const HOLD_TTL_SECONDS = 5 * 60; // 5 minutes
export const HOLD_KEY_PREFIX = 'hold:reservation:';

@Injectable()
export class ReservationLockService {
  private readonly logger = new Logger(ReservationLockService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  holdKey(reservationId: string): string {
    return `${HOLD_KEY_PREFIX}${reservationId}`;
  }

  /**
   * Creates the Redis hold key for a freshly-created PENDING reservation.
   * Called right after the Postgres transaction that decremented
   * availableTickets has committed.
   *
   * If Redis is briefly unavailable, we log a warning and move on rather
   * than fail the request — the reservation is already correctly
   * persisted in Postgres with an `expiresAt`, and the backup sweeper
   * (which never touches Redis) will still release it later even if this
   * key was never created.
   */
  async createHold(reservationId: string, quantity: number): Promise<void> {
    try {
      await this.redis.set(
        this.holdKey(reservationId),
        String(quantity),
        'EX',
        HOLD_TTL_SECONDS,
        'NX',
      );
    } catch (err) {
      this.logger.warn(
        `Could not create Redis hold key for reservation ${reservationId}: ${(err as Error).message}`,
      );
    }
  }

  /** Removes the hold key on confirm, so it never fires a stale expiry event. */
  async clearHold(reservationId: string): Promise<void> {
    try {
      await this.redis.del(this.holdKey(reservationId));
    } catch (err) {
      this.logger.warn(
        `Could not clear Redis hold key for reservation ${reservationId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * The single place both the Redis expiry subscriber and the backup
   * sweeper call into. Idempotent: if the reservation is already
   * CONFIRMED or already CANCELLED, this is a safe no-op — that's what
   * makes it harmless if both mechanisms happen to fire for the same
   * reservation.
   */
  async revertIfStillPending(reservationId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const reservationRepo = manager.getRepository(Reservation);
      const eventRepo = manager.getRepository(EventRef);

      const reservation = await reservationRepo.findOne({
        where: { id: reservationId },
      });

      if (!reservation || reservation.status !== ReservationStatus.PENDING) {
        return;
      }

      reservation.status = ReservationStatus.CANCELLED;
      await reservationRepo.save(reservation);

      const event = await eventRepo
        .createQueryBuilder('event')
        .setLock('pessimistic_write')
        .where('event.id = :id', { id: reservation.eventId })
        .getOne();

      if (event) {
        event.availableTickets += reservation.quantity;
        await eventRepo.save(event);
      }

      this.logger.log(
        `Reservation ${reservationId} expired without payment — released ${reservation.quantity} ticket(s) back to event ${reservation.eventId}`,
      );
    });
  }
}
