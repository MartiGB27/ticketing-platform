import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { buildRouteTargets, resolveTarget } from './routes';
import { createJwtPrecheckMiddleware } from './jwt-precheck.middleware';

const PORT = process.env.PORT ?? 3000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  // eslint-disable-next-line no-console
  console.error('Missing JWT_SECRET environment variable. Refusing to start.');
  process.exit(1);
}

const routes = buildRouteTargets();
const app = express();

// Simple liveness check for the gateway itself (useful for a Docker
// healthcheck later on). Placed before everything else, unauthenticated.
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'gateway' });
});

// 404 fast for any path that doesn't map to a known service, before
// spending effort on JWT verification or a proxy hop.
app.use((req: Request, res: Response, next: NextFunction) => {
  const target = resolveTarget(req.path, routes);
  if (!target) {
    return res.status(404).json({
      statusCode: 404,
      message: `No service registered for path ${req.path}`,
    });
  }
  return next();
});

app.use(createJwtPrecheckMiddleware(JWT_SECRET));

// IMPORTANT: no express.json() or any other body-parsing middleware is
// registered anywhere above. The gateway forwards the raw request stream
// untouched to whichever service owns the path; each backend service
// parses its own body. Parsing it here would consume the stream and
// require re-serializing it correctly for the proxied request, for zero
// benefit — the gateway doesn't need to read the body at all.
app.use(
  createProxyMiddleware({
    router: (req) => resolveTarget(req.path, routes) ?? undefined,
    changeOrigin: true,
    on: {
      error: (err, _req, res) => {
        // eslint-disable-next-line no-console
        console.error('Proxy error:', err.message);
        const response = res as Response;
        if (!response.headersSent) {
          response
            .status(502)
            .json({ statusCode: 502, message: 'Upstream service unavailable' });
        }
      },
    },
  }),
);

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`🚪 gateway listening on http://localhost:${PORT}`);
  routes.forEach((route) => {
    // eslint-disable-next-line no-console
    console.log(`   ${route.prefix} -> ${route.target}`);
  });
});
