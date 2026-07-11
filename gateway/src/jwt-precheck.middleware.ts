import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Fail-fast JWT check.
 *
 * This does NOT decide whether a route requires authentication — that
 * responsibility stays with each downstream service's own JwtAuthGuard
 * (defense in depth: a service is still safe even if someone bypasses the
 * gateway on the internal Docker network).
 *
 * What this middleware DOES do: if an Authorization header is present, it
 * verifies the token's signature and expiry right here, before spending a
 * network hop proxying to a downstream service that would reject it
 * anyway. If no header is present at all, it just lets the request
 * through — the downstream service will return 401 itself if that route
 * needs a token.
 */
export function createJwtPrecheckMiddleware(jwtSecret: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
      return next();
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({
        statusCode: 401,
        message: 'Malformed Authorization header',
      });
    }

    try {
      jwt.verify(token, jwtSecret);
      return next();
    } catch (err) {
      return res.status(401).json({
        statusCode: 401,
        message: 'Invalid or expired token',
      });
    }
  };
}
