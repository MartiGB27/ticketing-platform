import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { JwtStrategy } from './strategies/jwt.strategy';

// Unlike users-service's AuthModule, this one never SIGNS a token — it
// only verifies tokens that users-service already issued. That's why
// there's no JwtModule/AuthService/AuthController here, just the Passport
// strategy that JwtAuthGuard relies on.
@Module({
  imports: [PassportModule, ConfigModule],
  providers: [JwtStrategy],
})
export class AuthModule {}
