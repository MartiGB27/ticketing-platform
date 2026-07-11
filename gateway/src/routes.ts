// Central place that decides which backend service owns which path
// prefix. Adding a new service later (e.g. a notifications HTTP endpoint
// in Phase 3) means adding one line here — nothing else in the gateway
// needs to change.
export interface RouteTarget {
  prefix: string;
  target: string;
}

export function buildRouteTargets(): RouteTarget[] {
  const usersServiceUrl = process.env.USERS_SERVICE_URL ?? 'http://localhost:3001';
  const eventsServiceUrl = process.env.EVENTS_SERVICE_URL ?? 'http://localhost:3002';
  const reservationsServiceUrl =
    process.env.RESERVATIONS_SERVICE_URL ?? 'http://localhost:3003';

  return [
    // Both /auth/* and /users/* are handled by users-service, since login
    // needs direct access to the users table.
    { prefix: '/auth', target: usersServiceUrl },
    { prefix: '/users', target: usersServiceUrl },
    { prefix: '/events', target: eventsServiceUrl },
    { prefix: '/reservations', target: reservationsServiceUrl },
  ];
}

export function resolveTarget(
  path: string,
  routes: RouteTarget[],
): string | null {
  const match = routes.find((route) => path.startsWith(route.prefix));
  return match ? match.target : null;
}
