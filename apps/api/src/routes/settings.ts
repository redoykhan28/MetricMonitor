import { Hono } from 'hono';
import { getDb } from '../db';
import { workspaces, workspaceSettings } from '../db/schema';
import { eq } from 'drizzle-orm';
import { Env } from '../index';
import { sendViaBrevo } from '../services/dispatcher';
import { alertEmailHtml, testAlertEmailHtml } from '../services/emailTemplates';

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

// POST /api/settings/test-email
settingsRoutes.post('/test-email', async (c) => {
  const userId = c.get('userId');
  const db = getDb(c.env);
  const body = await c.req.json().catch(() => ({}));

  let targetEmails: string[] = [];
  const raw = body.emails || body.email;
  if (Array.isArray(raw)) {
    targetEmails = raw.map((e: any) => String(e).trim()).filter(Boolean);
  } else if (typeof raw === 'string') {
    targetEmails = raw.split(',').map((e: string) => e.trim()).filter(Boolean);
  }

  if (targetEmails.length === 0) {
    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.ownerId, userId)
    });
    if (workspace) {
      const settings = await db.query.workspaceSettings.findFirst({
        where: eq(workspaceSettings.workspaceId, workspace.id)
      });
      if (settings?.alertEmails) {
        targetEmails = settings.alertEmails.split(',').map((e: string) => e.trim()).filter(Boolean);
      }
    }
  }

  if (targetEmails.length === 0) {
    return c.json({ error: 'Please enter at least one email address to send the test alert to.' }, 400);
  }

  const html = testAlertEmailHtml({
    recipients: targetEmails,
    dashboardUrl: c.env.DASHBOARD_URL || 'http://localhost:5173',
  });

  const result = await sendViaBrevo(
    c.env,
    targetEmails,
    '🧪 [TEST NOTIFICATION] MetricMonitor Alert Channel is Working (No Action Needed)',
    html
  );

  if (!result.success) {
    return c.json({ error: result.error || 'Failed to send test email via Brevo' }, 500);
  }

  return c.json({ 
    success: true, 
    message: `Test email successfully sent to ${targetEmails.join(', ')}` 
  });
});

export default settingsRoutes;
