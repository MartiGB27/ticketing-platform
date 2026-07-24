import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import { ReservationsModule } from './reservations/reservations.module';
import { Reservation } from './reservations/entities/reservation.entity';
import { EventRef } from './reservations/entities/event-ref.entity';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        genReqId: (req: any, res: any) => {
          const existing = req.headers['x-request-id'];
          if (existing) return existing;
          const id = randomUUID();
          res.setHeader('x-request-id', id);
          return id;
        },
        redact: ['req.headers.authorization'],
      },
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(), // powers the @Interval() backup sweeper
    RedisModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USER', 'ticketing'),
        password: config.get<string>('DB_PASSWORD', ''),
        database: config.get<string>('DB_NAME', 'ticketing_db'),
        entities: [Reservation, EventRef],
        // This service owns the `reservations` table, so synchronize can
        // safely create/update it. EventRef is excluded from sync via its
        // own `@Entity({ synchronize: false })` option (see that file) —
        // this service must never alter the `events` table's schema.
        synchronize: true,
        retryAttempts: 10,
        retryDelay: 3000,
        logging: ['error', 'warn'],
      }),
    }),
    ReservationsModule,
  ],
})
export class AppModule {}
