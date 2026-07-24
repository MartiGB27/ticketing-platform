import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Two jobs, done together since they need the same timing:
 *
 * 1. Request-id propagation: reuses an incoming `x-request-id` header if
 *    the client already sent one, otherwise generates a fresh one. Sets
 *    it on the request (so it gets forwarded to whichever backend
 *    service the proxy routes to — that service's own pino logger picks
 *    it up from the same header) and on the response (so the client can
 *    correlate their own logs against ours).
 *
 * 2. Structured JSON access logging: one line per completed request,
 *    written directly with console.log rather than a logging library —
 *    the Gateway is deliberately thin (see main.ts), and one JSON.stringify
 *    call doesn't justify pulling in pino here too.
 */
export function requestLoggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const existing = req.headers['x-request-id'];
  const requestId =
    (typeof existing === 'string' && existing) || randomUUID();

  req.headers['x-request-id'] = requestId;
  res.setHeader('x-request-id', requestId);

  const startedAt = Date.now();

  res.on('finish', () => {
    const logLine = {
      level: 'info',
      time: new Date().toISOString(),
      service: 'gateway',
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
    };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(logLine));
  });

  next();
}
