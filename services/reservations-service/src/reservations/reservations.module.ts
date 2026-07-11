import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Reservation } from './entities/reservation.entity';
import { EventRef } from './entities/event-ref.entity';
import { ReservationsService } from './reservations.service';
import { ReservationsController } from './reservations.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  // EventRef must be registered here too, even though this service
  // doesn't own that table — TypeORM needs it in the feature repository
  // list to build a Repository<EventRef> for the pessimistic-lock query.
  imports: [
    TypeOrmModule.forFeature([Reservation, EventRef]),
    AuthModule,
  ],
  controllers: [ReservationsController],
  providers: [ReservationsService],
  exports: [ReservationsService],
})
export class ReservationsModule {}
