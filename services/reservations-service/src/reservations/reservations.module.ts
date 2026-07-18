import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Reservation } from './entities/reservation.entity';
import { EventRef } from './entities/event-ref.entity';
import { ReservationsService } from './reservations.service';
import { ReservationsController } from './reservations.controller';
import { AuthModule } from '../auth/auth.module';
import { ReservationLockService } from './reservation-lock.service';
import { ReservationExpirySubscriber } from './reservation-expiry.subscriber';
import { ReservationExpirySweeper } from './reservation-expiry.sweeper';
import { IdempotencyService } from './idempotency.service';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  // EventRef must be registered here too, even though this service
  // doesn't own that table — TypeORM needs it in the feature repository
  // list to build a Repository<EventRef> for the pessimistic-lock query
  // and for reading event details when building notification messages.
  imports: [
    TypeOrmModule.forFeature([Reservation, EventRef]),
    AuthModule,
    MessagingModule,
  ],
  controllers: [ReservationsController],
  providers: [
    ReservationsService,
    ReservationLockService,
    ReservationExpirySubscriber,
    ReservationExpirySweeper,
    IdempotencyService,
  ],
  exports: [ReservationsService],
})
export class ReservationsModule {}
