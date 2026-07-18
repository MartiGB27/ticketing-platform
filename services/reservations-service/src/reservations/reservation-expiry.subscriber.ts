import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_SUBSCRIBER } from '../redis/redis.module';
import { ReservationLockService, HOLD_KEY_PREFIX } from './reservation-lock.service';

// With `notify-keyspace-events Ex` set on the Redis server, an expired
// key publishes its name as the message on this channel (db 0 by default).
const EXPIRED_EVENTS_CHANNEL = '__keyevent@0__:expired';

/**
 * Primary mechanism for releasing an expired 5-minute hold: react to
 * Redis telling us a `hold:reservation:*` key just expired, in real time.
 *
 * Known limitation (documented, not hidden): Redis keyspace notifications
 * are fire-and-forget pub/sub. If no subscriber is connected at the exact
 * moment a key expires, that notification is lost forever — Redis does
 * not queue or replay it. See ReservationExpirySweeper for the backup
 * mechanism that covers this gap.
 */
@Injectable()
export class ReservationExpirySubscriber
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ReservationExpirySubscriber.name);

  constructor(
    @Inject(REDIS_SUBSCRIBER) private readonly subscriber: Redis,
    private readonly lockService: ReservationLockService,
  ) {}

  async onModuleInit() {
    await this.subscriber.subscribe(EXPIRED_EVENTS_CHANNEL);
    this.subscriber.on('message', (channel, message) =>
      this.handleMessage(channel, message),
    );
    this.logger.log(`Subscribed to ${EXPIRED_EVENTS_CHANNEL} for hold expiry`);
  }

  async onModuleDestroy() {
    await this.subscriber.unsubscribe(EXPIRED_EVENTS_CHANNEL);
  }

  private handleMessage(channel: string, expiredKey: string): void {
    if (channel !== EXPIRED_EVENTS_CHANNEL || !expiredKey.startsWith(HOLD_KEY_PREFIX)) {
      return;
    }

    const reservationId = expiredKey.slice(HOLD_KEY_PREFIX.length);
    this.logger.log(
      `Hold expired for reservation ${reservationId}, reverting if still pending`,
    );

    this.lockService.revertIfStillPending(reservationId).catch((err) => {
      this.logger.error(
        `Failed to revert expired reservation ${reservationId}: ${(err as Error).message}`,
      );
    });
  }
}
