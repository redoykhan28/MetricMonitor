import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { setupClerk, requireAuth } from './middleware/auth';
import { getDb } from './db';
import { users, workspaces } from './db/schema';
import { eq } from 'drizzle-orm';

export type Env = {
  MONITOR_QUEUE: Queue;
  METRIC_CACHE: KVNamespace;
  TURSO_URL: string;
  TURSO_AUTH_TOKEN: string;
  CLERK_SECRET_KEY: string;
  CLERK_PUBLISHABLE_KEY: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  RESEND_API_KEY: string;
};

// Define Hono app with custom Context variables
type Variables = {
  userId: string;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// --- Global Middleware ---
app.use('*', cors());
app.use('*', setupClerk());

// --- Public Routes ---
app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// --- Protected API Routes ---
const protectedApi = new Hono<{ Bindings: Env; Variables: Variables }>();
protectedApi.use('*', requireAuth);

protectedApi.get('/me', async (c) => {
  const userId = c.get('userId');
  const db = getDb(c.env);
  
  // Example query: Fetch the user and their workspaces
  const userRecord = await db.query.users.findFirst({
    where: eq(users.id, userId)
  });

  return c.json({ 
    userId, 
    user: userRecord || null,
    message: "You have securely accessed a protected route!" 
  });
});

import googleRoutes from './routes/google';
import dashboardRoutes from './routes/dashboard';
import settingsRoutes from './routes/settings';
import trackersRoutes from './routes/trackers';
import alertsRoutes from './routes/alerts';
import notificationsRoutes from './routes/notifications';

// Mount the protected routes under /api
app.route('/api', protectedApi);
app.route('/api/google', googleRoutes);
app.route('/api/dashboard', dashboardRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api/trackers', trackersRoutes);
app.route('/api/alerts', alertsRoutes);
app.route('/api/notifications', notificationsRoutes);

import { MonitoringEngine } from './services/monitor';

// --- Cloudflare Worker Entrypoint ---
export default {
  // 1. HTTP API Handler
  fetch: app.fetch,

  // 2. Cron Trigger Handler
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    console.log(`[Cron] Fired at: ${event.cron}`);
    const engine = new MonitoringEngine(env);
    
    // We use ctx.waitUntil so the worker stays alive until the enqueueing is completely done
    ctx.waitUntil(engine.enqueueActiveProperties());
  },

  // 3. Queue Consumer Handler
  async queue(batch: MessageBatch<any>, env: Env, ctx: ExecutionContext) {
    const engine = new MonitoringEngine(env);
    
    for (const message of batch.messages) {
      try {
        console.log(`[Queue] Processing property:`, message.body.propertyId);
        
        await engine.processProperty(
          message.body.propertyId,
          message.body.ga4PropertyId,
          message.body.workspaceId
        );
        
        message.ack();
      } catch (error) {
        console.error(`[Queue] Failed processing property ${message.body.propertyId}:`, error);
        message.retry();
      }
    }
  }
};
