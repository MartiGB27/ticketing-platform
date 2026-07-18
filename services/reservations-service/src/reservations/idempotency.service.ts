import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

const IDEMPOTENCY_TTL_SECONDS = 60 * 60 * 24; // 24h — long enough to cover realistic retries

export type IdempotencyOutcome<T> =
  | { status: 'fresh' }
  | { status: 'cached'; value: T }
  | { status: 'in-progress' };

/**
 * Modeled after how Stripe's API requires an Idempotency-Key on
 * payment-mutating calls. `claim()` atomically decides whether this is a
 * brand-new request, a duplicate of one already finished (return the
 * cached result instead of reprocessing), or a duplicate of one still in
 * flight (ask the caller to retry shortly rather than double-run the
 * critical section).
 */
@Injectable()
export class IdempotencyService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private key(scope: string, idempotencyKey: string): string {
    return `idempotency:${scope}:${idempotencyKey}`;
  }

  async claim<T>(
    scope: string,
    idempotencyKey: string,
  ): Promise<IdempotencyOutcome<T>> {
    const key = this.key(scope, idempotencyKey);
    const claimed = await this.redis.set(
      key,
      'in-progress',
      'EX',
      IDEMPOTENCY_TTL_SECONDS,
      'NX',
    );

    if (claimed === 'OK') {
      return { status: 'fresh' };
    }

    const existing = await this.redis.get(key);
    if (existing === null || existing === 'in-progress') {
      return { status: 'in-progress' };
    }

    return { status: 'cached', value: JSON.parse(existing) as T };
  }

  async store<T>(
    scope: string,
    idempotencyKey: string,
    value: T,
  ): Promise<void> {
    const key = this.key(scope, idempotencyKey);
    await this.redis.set(key, JSON.stringify(value), 'EX', IDEMPOTENCY_TTL_SECONDS);
  }

  /**
   * Releases the claim WITHOUT caching a result. Used if the real work
   * throws, so a genuinely failed attempt doesn't permanently block
   * retries with the same key for the next 24h.
   */
  async release(scope: string, idempotencyKey: string): Promise<void> {
    const key = this.key(scope, idempotencyKey);
    await this.redis.del(key);
  }
}
