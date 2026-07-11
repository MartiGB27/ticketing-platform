import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface JwtPayload {
  sub: string; // user id
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  // Stateless validation: this service has no direct access to the users
  // database (and shouldn't — that's users-service's data), so it trusts
  // the signed JWT payload instead of looking the user up again. If the
  // signature check above passed, the token was genuinely issued by
  // users-service, since both share the same JWT_SECRET.
  //
  // Trade-off: if a user is deleted or a token needs to be revoked before
  // it expires, this service won't know until the token's own expiry.
  async validate(payload: JwtPayload) {
    return { id: payload.sub, email: payload.email };
  }
}
