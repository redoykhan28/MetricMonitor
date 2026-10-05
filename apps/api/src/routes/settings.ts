import { Hono } from 'hono';
import { getDb } from '../db';
import { workspaces, workspaceSettings } from '../db/schema';
import { eq } from 'drizzle-orm';
import { Env } from '../index';

const settingsRoutes = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

// GET /api/settings
settingsRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const db = getDb(c.env);

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.ownerId, userId)
  });

  if (!workspace) return c.json({ error: 'Workspace not found' }, 404);

  let settings = await db.query.workspaceSettings.findFirst({
    where: eq(workspaceSettings.workspaceId, workspace.id)
  });

  if (!settings) {
    // Default settings
    settings = {
      workspaceId: workspace.id,
      enableNotifications: true,
      globalCooldownHours: 4,
      alertEmails: null,
      emailOnWelcome: true,
      emailOnGa4Added: false,
      emailOnTrackerAdded: false,
      discordWebhookUrl: null,
      updatedAt: new Date()
    };
  }

  return c.json({ settings });
});

// POST /api/settings
settingsRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const db = getDb(c.env);
  const body = await c.req.json();

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.ownerId, userId)
  });

  if (!workspace) return c.json({ error: 'Workspace not found' }, 404);

  await db.insert(workspaceSettings).values({
    workspaceId: workspace.id,
    enableNotifications: body.enableNotifications,
    globalCooldownHours: body.globalCooldownHours,
    alertEmails: body.alertEmails,
    emailOnWelcome: body.emailOnWelcome,
    emailOnGa4Added: body.emailOnGa4Added,
    emailOnTrackerAdded: body.emailOnTrackerAdded,
    discordWebhookUrl: body.discordWebhookUrl,
    updatedAt: new Date()
  }).onConflictDoUpdate({
    target: workspaceSettings.workspaceId,
    set: {
      enableNotifications: body.enableNotifications,
      globalCooldownHours: body.globalCooldownHours,
      alertEmails: body.alertEmails,
      emailOnWelcome: body.emailOnWelcome,
      emailOnGa4Added: body.emailOnGa4Added,
      emailOnTrackerAdded: body.emailOnTrackerAdded,
      discordWebhookUrl: body.discordWebhookUrl,
      updatedAt: new Date()
    }
  });

  return c.json({ success: true });
});

export default settingsRoutes;
