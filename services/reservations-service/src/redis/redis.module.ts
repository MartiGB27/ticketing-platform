import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';
export const REDIS_SUBSCRIBER = 'REDIS_SUBSCRIBER';

/**
 * Two separate Redis connections, on purpose:
 *
 * - REDIS_CLIENT: for normal commands (SET/GET/DEL) used by the hold and
 *   idempotency logic.
 * - REDIS_SUBSCRIBER: a dedicated connection for pub/sub. Once a Redis
 *   connection issues SUBSCRIBE, it can't be used for regular commands
 *   anymore — ioredis (and Redis itself) require a separate connection
 *   for that.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return new Redis({
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        });
      },
    },
    {
      provide: REDIS_SUBSCRIBER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return new Redis({
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        });
      },
    },
  ],
  exports: [REDIS_CLIENT, REDIS_SUBSCRIBER],
})
export class RedisModule {}
