import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';

export class CreateEventDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  venue: string;

  @IsDateString()
  eventDate: string;

  @IsInt()
  @Min(1)
  totalTickets: number;

  @IsNumber()
  @IsPositive()
  price: number;
}
