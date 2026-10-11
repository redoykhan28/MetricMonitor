import { getDb } from '../db';
import { notifications, workspaceSettings } from '../db/schema';
import { eq } from 'drizzle-orm';
import {
  alertEmailHtml,
  recoveryEmailHtml,
  welcomeEmailHtml,
  ga4AddedEmailHtml,
  revokedTokenEmailHtml,
} from './emailTemplates';

export type EventType = 'welcome' | 'ga4_added' | 'tracker_added' | 'alert' | 'revoked_token';

interface AlertMeta {
  trackerName?: string;
  metric?: string;
  current?: number;
  baseline?: number;
  propertyName?: string;
  ga4PropertyId?: string;
  userFirstName?: string;
}

// ─── Resend Email Sender ──────────────────────────────────────────────────────
async function sendViaResend(env: any, to: string[], subject: string, html: string): Promise<void> {
  const resendApiKey = env.RESEND_API_KEY;
  const fromAddress = env.RESEND_FROM_EMAIL || 'MetricMonitor <alerts@metricmonitor.io>';

  if (!resendApiKey) {
    // Simulation mode for local dev — logs to terminal
    console.log('\n══════════════════════════════════════════════════');
    console.log(`✉️  [SIMULATED EMAIL] → To: ${to.join(', ')}`);
    console.log(`   Subject: ${subject}`);
    console.log('══════════════════════════════════════════════════\n');
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: fromAddress, to, subject, html }),
  });

  if (!res.ok) {
    const error = await res.text();
    console.error(`[Dispatcher] Resend API error: ${res.status} — ${error}`);
  } else {
    console.log(`[Dispatcher] ✉️  Email sent to ${to.length} recipient(s): "${subject}"`);
  }
}

// ─── Discord Sender ───────────────────────────────────────────────────────────
async function sendViaDiscord(webhookUrl: string, title: string, message: string, color = 0x7c3aed): Promise<void> {
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title,
          description: message,
          color,
          footer: { text: 'MetricMonitor' },
          timestamp: new Date().toISOString(),
        }],
      }),
    });
    if (!res.ok) console.error(`[Dispatcher] Discord webhook error: ${res.status}`);
  } catch (e) {
    console.error('[Dispatcher] Discord webhook failed:', e);
  }
}

// ─── Main Dispatch Function ───────────────────────────────────────────────────
export async function dispatchEvent(
  env: any,
  workspaceId: string,
  type: EventType,
  title: string,
  message: string,
  meta?: AlertMeta
): Promise<void> {
  const db = getDb(env);

  // 1. Always log to in-app notification center
  await db.insert(notifications).values({
    id: crypto.randomUUID(),
    workspaceId,
    title,
    message,
    type: type === 'revoked_token' ? 'alert' : type,
    isRead: false,
  });

  // 2. Fetch workspace settings
  const settings = await db.query.workspaceSettings.findFirst({
    where: eq(workspaceSettings.workspaceId, workspaceId),
  });

  if (!settings || !settings.enableNotifications) return;

  // 3. Discord dispatch (all types, if configured)
  if (settings.discordWebhookUrl) {
    const discordColor =
      type === 'alert' || type === 'revoked_token' ? 0xef4444
      : type === 'ga4_added' || type === 'tracker_added' ? 0x22c55e
      : 0x7c3aed;
    await sendViaDiscord(settings.discordWebhookUrl, title, message, discordColor);
  }

  // 4. Email dispatch — check user's preferences per event type
  const emails = settings.alertEmails
    ? settings.alertEmails.split(',').map((e) => e.trim()).filter(Boolean)
    : [];

  if (emails.length === 0) return;

  let shouldEmail = false;
  if (type === 'alert' || type === 'revoked_token') shouldEmail = true; // Always mandatory
  if (type === 'welcome' && settings.emailOnWelcome) shouldEmail = true;
  if (type === 'ga4_added' && settings.emailOnGa4Added) shouldEmail = true;
  if (type === 'tracker_added' && settings.emailOnTrackerAdded) shouldEmail = true;

  if (!shouldEmail) return;

  // 5. Build the correct HTML template for each event type
  let html = '';
  const dashboardUrl = env.DASHBOARD_URL || 'https://app.metricmonitor.io';

  switch (type) {
    case 'alert':
      html = alertEmailHtml({
        trackerName: meta?.trackerName || title,
        metric: meta?.metric || 'Unknown Metric',
        current: meta?.current ?? 0,
        baseline: meta?.baseline ?? 0,
        propertyName: meta?.propertyName,
        dashboardUrl,
      });
      break;

    case 'welcome':
      html = welcomeEmailHtml({ userFirstName: meta?.userFirstName, dashboardUrl });
      break;

    case 'ga4_added':
      html = ga4AddedEmailHtml({
        propertyName: meta?.propertyName || 'New Property',
        ga4PropertyId: meta?.ga4PropertyId || '',
        dashboardUrl,
      });
      break;

    case 'tracker_added':
      // Simple branded fallback for tracker added
      html = `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#09090b;color:#e4e4e7;padding:32px;">
        <div style="max-width:520px;margin:0 auto;background:#18181b;border-radius:16px;padding:32px;border:1px solid #27272a;">
          <h2 style="color:#a78bfa;margin:0 0 16px;">⬡ MetricMonitor</h2>
          <h3 style="color:#e4e4e7;margin:0 0 12px;">🎯 New Tracker Active</h3>
          <p style="color:#a1a1aa;">${message}</p>
          <a href="${dashboardUrl}" style="display:inline-block;margin-top:20px;background:#7c3aed;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">View Dashboard →</a>
        </div>
      </body></html>`;
      break;

    case 'revoked_token':
      html = revokedTokenEmailHtml({ dashboardUrl });
      break;
  }

  await sendViaResend(env, emails, title, html);
}

// ─── Convenience: Alert-only dispatcher for the monitoring engine ─────────────
export async function dispatchAlert(
  env: any,
  workspaceId: string,
  opts: {
    trackerName: string;
    metric: string;
    current: number;
    baseline: number;
    propertyName?: string;
    emails: string[];
    discordWebhookUrl?: string;
  }
): Promise<void> {
  const dropPct = opts.baseline > 0
    ? Math.round(((opts.baseline - opts.current) / opts.baseline) * 100)
    : 0;

  const title = `🚨 Alert: "${opts.trackerName}" dropped ${dropPct}%`;
  const message = `${opts.metric} dropped from ${opts.baseline.toLocaleString()} to ${opts.current.toLocaleString()} (${dropPct}% drop) on ${opts.propertyName || 'your property'}.`;

  await dispatchEvent(env, workspaceId, 'alert', title, message, {
    trackerName: opts.trackerName,
    metric: opts.metric,
    current: opts.current,
    baseline: opts.baseline,
    propertyName: opts.propertyName,
  });
}

// ─── Convenience: Recovery dispatcher ────────────────────────────────────────
export async function dispatchRecovery(
  env: any,
  workspaceId: string,
  opts: {
    trackerName: string;
    metric: string;
    current: number;
    baseline: number;
    propertyName?: string;
    emails: string[];
    discordWebhookUrl?: string;
  }
): Promise<void> {
  const html = recoveryEmailHtml({
    trackerName: opts.trackerName,
    metric: opts.metric,
    current: opts.current,
    baseline: opts.baseline,
    propertyName: opts.propertyName,
    dashboardUrl: env.DASHBOARD_URL || 'https://app.metricmonitor.io',
  });

  const subject = `✅ Resolved: "${opts.trackerName}" has recovered`;

  // Write in-app notification
  const db = getDb(env);
  await db.insert(notifications).values({
    id: crypto.randomUUID(),
    workspaceId,
    title: subject,
    message: `${opts.metric} has returned to normal. Current: ${opts.current.toLocaleString()}, Baseline: ${opts.baseline.toLocaleString()}.`,
    type: 'alert',
    isRead: false,
  });

  // Discord recovery
  if (opts.discordWebhookUrl) {
    await sendViaDiscord(
      opts.discordWebhookUrl,
      subject,
      `${opts.metric} has recovered on ${opts.propertyName || 'your property'}.`,
      0x22c55e
    );
  }

  // Email recovery
  if (opts.emails.length > 0) {
    await sendViaResend(env, opts.emails, subject, html);
  }
}
