import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Reservation, ReservationStatus } from './entities/reservation.entity';
import { ReservationLockService } from './reservation-lock.service';

const SWEEP_INTERVAL_MS = 60 * 1000; // 60s

/**
 * Backup safety net for ReservationExpirySubscriber. This sweeper doesn't
 * touch Redis for its own scheduling at all — it just asks Postgres
 * "which PENDING reservations are past their expiresAt?" every 60
 * seconds and reverts anything it finds. Worst case, a hold that was
 * missed by the Redis pub/sub path takes up to ~60s longer to release —
 * but it WILL get released, even if this service was mid-restart at the
 * exact moment the Redis key expired.
 */
@Injectable()
export class ReservationExpirySweeper {
  private readonly logger = new Logger(ReservationExpirySweeper.name);

  constructor(
    @InjectRepository(Reservation)
    private readonly reservationsRepository: Repository<Reservation>,
    private readonly lockService: ReservationLockService,
  ) {}

  @Interval(SWEEP_INTERVAL_MS)
  async sweep(): Promise<void> {
    const expired = await this.reservationsRepository.find({
      where: {
        status: ReservationStatus.PENDING,
        expiresAt: LessThan(new Date()),
      },
    });

    if (expired.length === 0) {
      return;
    }

    this.logger.log(
      `Sweeper found ${expired.length} expired pending reservation(s)`,
    );

    for (const reservation of expired) {
      await this.lockService.revertIfStillPending(reservation.id);
    }
  }
}
