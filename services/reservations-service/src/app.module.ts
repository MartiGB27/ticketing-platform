import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReservationsModule } from './reservations/reservations.module';
import { Reservation } from './reservations/entities/reservation.entity';
import { EventRef } from './reservations/entities/event-ref.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
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
