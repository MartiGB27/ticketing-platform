import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

type AuthenticatedUser = { id: string; email: string };

@UseGuards(JwtAuthGuard) // every reservation route requires login
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReservationDto,
  ) {
    return this.reservationsService.create(user.id, dto);
  }

  // Simulates the payment step. Modeled after Stripe's Idempotency-Key
  // convention: required here (not optional), since silently allowing an
  // un-keyed request on a payment-mutating endpoint would defeat the
  // whole point.
  @Post(':id/confirm')
  async confirm(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    return this.reservationsService.confirm(
      id,
      user.id,
      user.email,
      idempotencyKey,
    );
  }

  @Get()
  async findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.reservationsService.findAllForUser(user.id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.reservationsService.findOne(id);
  }
}
