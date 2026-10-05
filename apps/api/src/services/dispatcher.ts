import { getDb } from '../db';
import { notifications, workspaceSettings } from '../db/schema';
import { eq } from 'drizzle-orm';

export type EventType = 'welcome' | 'ga4_added' | 'tracker_added' | 'alert';

export async function dispatchEvent(
  env: any,
  workspaceId: string,
  type: EventType,
  title: string,
  message: string,
  meta?: any
) {
  const db = getDb(env);

  // 1. Log to in-app notifications
  await db.insert(notifications).values({
    id: crypto.randomUUID(),
    workspaceId,
    title,
    message,
    type,
    isRead: false
  });

  // 2. Fetch workspace settings
  const settings = await db.query.workspaceSettings.findFirst({
    where: eq(workspaceSettings.workspaceId, workspaceId)
  });

  if (!settings || !settings.enableNotifications) return;

  // 3. Dispatch to Discord (if configured)
  if (settings.discordWebhookUrl) {
    try {
      await fetch(settings.discordWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `**${title}**\n${message}`,
          embeds: meta ? [{ description: JSON.stringify(meta) }] : undefined
        })
      });
    } catch (e) {
      console.error('[Dispatcher] Discord webhook failed:', e);
    }
  }

  // 4. Dispatch to Email (if configured)
  const emails = settings.alertEmails ? settings.alertEmails.split(',').map(e => e.trim()).filter(Boolean) : [];
  if (emails.length === 0) return;

  let shouldSendEmail = false;
  if (type === 'alert') shouldSendEmail = true; // Alerts are mandatory if emails exist
  if (type === 'welcome' && settings.emailOnWelcome) shouldSendEmail = true;
  if (type === 'ga4_added' && settings.emailOnGa4Added) shouldSendEmail = true;
  if (type === 'tracker_added' && settings.emailOnTrackerAdded) shouldSendEmail = true;

  if (shouldSendEmail) {
    const resendApiKey = env.RESEND_API_KEY;
    if (!resendApiKey) {
      // Simulation mode
      console.log('──────────────────────────────────────────────────');
      console.log(`✉️  [SIMULATED EMAIL DISPATCH] -> To: ${emails.join(', ')}`);
      console.log(`Subject: ${title}`);
      console.log(`Body: ${message}`);
      console.log('──────────────────────────────────────────────────');
    } else {
      // Real Resend API
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'MetricMonitor Alerts <alerts@metricmonitor.app>', // Or whatever verified domain they have
            to: emails,
            subject: title,
            html: `<h3>${title}</h3><p>${message.replace(/\n/g, '<br/>')}</p>`
          })
        });
        console.log(`[Dispatcher] Sent real email to ${emails.length} recipients`);
      } catch (e) {
        console.error('[Dispatcher] Email dispatch failed:', e);
      }
    }
  }
}
