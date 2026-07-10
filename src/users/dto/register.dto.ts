import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Invalid email format' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(72, { message: 'Password is too long' }) // bcrypt's limit
  password: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;
}
