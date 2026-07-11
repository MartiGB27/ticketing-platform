import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Used as @UseGuards(JwtAuthGuard) on any controller/route
// that requires an authenticated user.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
