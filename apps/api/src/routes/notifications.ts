import { Hono } from 'hono';
import { getDb } from '../db';
import { notifications, workspaces } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { Env } from '../index';
import { requireAuth } from '../middleware/auth';

const notificationsRoutes = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

notificationsRoutes.use('*', requireAuth);

// GET /api/notifications
notificationsRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const db = getDb(c.env);

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.ownerId, userId)
  });

  if (!workspace) return c.json({ notifications: [] });

  const data = await db.query.notifications.findMany({
    where: eq(notifications.workspaceId, workspace.id),
    orderBy: [desc(notifications.createdAt)],
    limit: 50
  });

  return c.json({ notifications: data });
});

// PATCH /api/notifications/:id/read
notificationsRoutes.patch('/:id/read', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = getDb(c.env);

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.ownerId, userId)
  });

  if (!workspace) return c.json({ error: 'Workspace not found' }, 404);

  // Validate notification belongs to workspace
  const notif = await db.query.notifications.findFirst({
    where: eq(notifications.id, id)
  });

  if (!notif || notif.workspaceId !== workspace.id) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  await db.update(notifications)
    .set({ isRead: true })
    .where(eq(notifications.id, id));

  return c.json({ success: true });
});

export default notificationsRoutes;
