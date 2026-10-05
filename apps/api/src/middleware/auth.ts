import { clerkMiddleware, getAuth } from '@hono/clerk-auth';
import { Context, Next } from 'hono';

// 1. Base Clerk Middleware (verifies the JWT token)
export const setupClerk = () => clerkMiddleware();

// 2. Protected Route Middleware (ensures user is logged in)
export const requireAuth = async (c: Context, next: Next) => {
  const auth = getAuth(c);

  if (!auth?.userId) {
    return c.json({ error: 'Unauthorized', message: 'You must be logged in to access this resource.' }, 401);
  }

  // Inject userId into the request context for downstream routes to use
  c.set('userId', auth.userId);
  await next();
};
