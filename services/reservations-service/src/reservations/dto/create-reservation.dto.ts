import { IsInt, IsPositive, IsUUID } from 'class-validator';

export class CreateReservationDto {
  @IsUUID()
  eventId: string;

  @IsInt()
  @IsPositive()
  quantity: number;
}
