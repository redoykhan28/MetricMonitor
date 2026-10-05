import { Env } from '../index';
import { getDb } from '../db';
import { properties, trackers, trackerEvents, googleCredentials, users, workspaces, workspaceSettings } from '../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { GA4Service } from './ga4';
import { Resend } from 'resend';

export class MonitoringEngine {
  private env: Env;
  
  constructor(env: Env) {
    this.env = env;
  }

  /**
   * Phase 3.2: The Producer
   * Called by the Cron Trigger. Finds all active properties and pushes them to the Queue.
   */
  async enqueueActiveProperties() {
    const db = getDb(this.env);
    
    // Fetch all properties that have at least one active tracker
    const activeProperties = await db.select({
      id: properties.id,
      ga4PropertyId: properties.ga4PropertyId,
      workspaceId: properties.workspaceId
    })
    .from(properties)
    .innerJoin(trackers, eq(properties.id, trackers.propertyId))
    .where(eq(trackers.isActive, true))
    .groupBy(properties.id);

    console.log(`[Producer] Found ${activeProperties.length} active properties to monitor.`);

    // Fan-out: Send each property to the Cloudflare Queue
    for (const prop of activeProperties) {
      await this.env.MONITOR_QUEUE.send({
        propertyId: prop.id,
        ga4PropertyId: prop.ga4PropertyId,
        workspaceId: prop.workspaceId
      });
    }
  }

  /**
   * Phase 3.3: The Consumer
   * Called by the Queue. Processes a single property, evaluates rules, and fires alerts.
   */
  async processProperty(propertyId: string, ga4PropertyId: string, workspaceId: string) {
    const db = getDb(this.env);
    
    // 1. Check workspace settings — are notifications globally enabled?
    const settings = await db.query.workspaceSettings.findFirst({
      where: eq(workspaceSettings.workspaceId, workspaceId)
    });

    if (settings && !settings.enableNotifications) {
      console.log(`[Consumer] Notifications disabled for workspace ${workspaceId}. Skipping.`);
      return;
    }

    // 2. Get the Google OAuth tokens for this workspace
    const credentials = await db.query.googleCredentials.findFirst({
      where: eq(googleCredentials.workspaceId, workspaceId)
    });

    if (!credentials) {
      console.warn(`[Consumer] No Google credentials found for workspace ${workspaceId}. Skipping.`);
      return;
    }

    // 3. Refresh token if expired
    let accessToken = credentials.accessToken;
    if (credentials.expiresAt && credentials.expiresAt < new Date()) {
      console.log(`[Consumer] Token expired for workspace ${workspaceId}. Refreshing...`);
      try {
        const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: this.env.GOOGLE_CLIENT_ID || '',
            client_secret: this.env.GOOGLE_CLIENT_SECRET || '',
            refresh_token: credentials.refreshToken,
            grant_type: 'refresh_token'
          })
        });
        const tokenData = await refreshResponse.json() as any;
        if (tokenData.access_token) {
          accessToken = tokenData.access_token;
          await db.update(googleCredentials)
            .set({
              accessToken: tokenData.access_token,
              expiresAt: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000)
            })
            .where(eq(googleCredentials.workspaceId, workspaceId));
        }
      } catch (err) {
        console.error(`[Consumer] Token refresh failed for workspace ${workspaceId}:`, err);
        return;
      }
    }

    const ga4 = new GA4Service(accessToken, this.env.METRIC_CACHE);

    // 4. Get all active trackers for this property
    const activeTrackers = await db.select().from(trackers).where(
      and(
        eq(trackers.propertyId, propertyId),
        eq(trackers.isActive, true)
      )
    );

    // 5. Evaluate each tracker
    for (const tracker of activeTrackers) {
      // Check Cooldown using settings or tracker-level cooldown
      const cooldownHours = settings?.globalCooldownHours || tracker.cooldownHours || 4;
      
      if (tracker.lastTriggeredAt) {
        const hoursSinceTrigger = (Date.now() - tracker.lastTriggeredAt.getTime()) / (1000 * 60 * 60);
        if (hoursSinceTrigger < cooldownHours) {
          console.log(`[Consumer] Tracker ${tracker.id} is in cooldown (${cooldownHours}h). Skipping.`);
          continue;
        }
      }

      // Calculate date ranges based on the compareWindow
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
      
      try {
        // 6. Fetch GA4 Data — current is always today
        const currentData = await ga4.getMetric(ga4PropertyId, tracker.metric, today, today);
        const currentValue = parseFloat(currentData.rows?.[0]?.metricValues?.[0]?.value || '0');
        
        // Baseline depends on compareWindow
        let baselineValue = 0;

        if (tracker.compareWindow === 'avg_7_days') {
          // Fetch the last 7 days and compute the average
          const baselineData = await ga4.getMetric(ga4PropertyId, tracker.metric, sevenDaysAgo, yesterday);
          const rows = baselineData.rows || [];
          if (rows.length > 0) {
            const total = rows.reduce((sum: number, row: any) => {
              return sum + parseFloat(row.metricValues?.[0]?.value || '0');
            }, 0);
            baselineValue = total / rows.length;
          }
        } else {
          // Default: previous_day
          const baselineData = await ga4.getMetric(ga4PropertyId, tracker.metric, yesterday, yesterday);
          baselineValue = parseFloat(baselineData.rows?.[0]?.metricValues?.[0]?.value || '0');
        }

        // 7. Evaluate Condition
        let isTriggered = false;
        
        if (tracker.condition === 'drops_by') {
          if (baselineValue > 0) {
            const dropPercentage = ((baselineValue - currentValue) / baselineValue) * 100;
            isTriggered = dropPercentage >= tracker.thresholdValue;
          }
        } else if (tracker.condition === 'greater_than') {
          isTriggered = currentValue > tracker.thresholdValue;
        } else if (tracker.condition === 'less_than') {
          isTriggered = currentValue < tracker.thresholdValue;
        }

        // 8. Fire Alert if triggered
        if (isTriggered) {
          console.log(`[ALERT] Tracker ${tracker.name} triggered! Current: ${currentValue}, Baseline: ${baselineValue}`);
          
          // Log Incident in Database
          await db.insert(trackerEvents).values({
            id: crypto.randomUUID(),
            trackerId: tracker.id,
            propertyId: propertyId,
            expectedValue: baselineValue.toString(),
            actualValue: currentValue.toString(),
            status: 'triggered',
            notifiedVia: 'email'
          });

          // Update Cooldown
          await db.update(trackers)
            .set({ lastTriggeredAt: new Date() })
            .where(eq(trackers.id, tracker.id));

          // Fetch user info for notifications
          const workspace = await db.query.workspaces.findFirst({
            where: eq(workspaces.id, workspaceId)
          });
          const user = await db.query.users.findFirst({
            where: eq(users.id, workspace?.ownerId || '')
          });

          // --- Send Email Alert ---
          const alertEmails = settings?.alertEmails 
            ? settings.alertEmails.split(',').map(e => e.trim()).filter(Boolean)
            : (user?.email ? [user.email] : []);
          
          if (alertEmails.length > 0 && this.env.RESEND_API_KEY) {
            for (const email of alertEmails) {
              await this.sendEmailAlert(email, tracker.name, tracker.metric, currentValue, baselineValue);
            }
          }

          // --- Send Slack Alert ---
          if (settings?.slackWebhookUrl) {
            await this.sendSlackAlert(settings.slackWebhookUrl, tracker.name, tracker.metric, currentValue, baselineValue);
          }

          // --- Send Discord Alert ---
          if (settings?.discordWebhookUrl) {
            await this.sendDiscordAlert(settings.discordWebhookUrl, tracker.name, tracker.metric, currentValue, baselineValue);
          }
        } else if (tracker.lastTriggeredAt) {
          // --- Recovery Detection ---
          // If the tracker was previously triggered but is now passing, send a recovery notification
          console.log(`[RECOVERY] Tracker ${tracker.name} has recovered. Current: ${currentValue}, Baseline: ${baselineValue}`);
          
          // Log recovery event
          await db.insert(trackerEvents).values({
            id: crypto.randomUUID(),
            trackerId: tracker.id,
            propertyId: propertyId,
            expectedValue: baselineValue.toString(),
            actualValue: currentValue.toString(),
            status: 'resolved',
            notifiedVia: 'email'
          });

          // Clear the lastTriggeredAt so it won't keep sending recovery notifications
          await db.update(trackers)
            .set({ lastTriggeredAt: null })
            .where(eq(trackers.id, tracker.id));

          // Fetch user info for recovery notifications
          const workspace = await db.query.workspaces.findFirst({
            where: eq(workspaces.id, workspaceId)
          });
          const user = await db.query.users.findFirst({
            where: eq(users.id, workspace?.ownerId || '')
          });

          const alertEmails = settings?.alertEmails 
            ? settings.alertEmails.split(',').map(e => e.trim()).filter(Boolean)
            : (user?.email ? [user.email] : []);
          
          if (alertEmails.length > 0 && this.env.RESEND_API_KEY) {
            for (const email of alertEmails) {
              await this.sendRecoveryEmail(email, tracker.name, tracker.metric, currentValue, baselineValue);
            }
          }

          if (settings?.slackWebhookUrl) {
            await this.sendSlackRecovery(settings.slackWebhookUrl, tracker.name, tracker.metric, currentValue, baselineValue);
          }

          // --- Send Discord Recovery ---
          if (settings?.discordWebhookUrl) {
            await this.sendDiscordRecovery(settings.discordWebhookUrl, tracker.name, tracker.metric, currentValue, baselineValue);
          }
        }
        
      } catch (error) {
        console.error(`[Consumer] Error evaluating tracker ${tracker.id}:`, error);
      }
    }
  }

  /**
   * Phase 4.1: Email Alerting via Resend
   */
  private async sendEmailAlert(toEmail: string, trackerName: string, metric: string, current: number, baseline: number) {
    const resend = new Resend(this.env.RESEND_API_KEY);
    const dropPct = baseline > 0 ? Math.round(((baseline - current) / baseline) * 100) : 0;
    
    await resend.emails.send({
      from: 'MetricMonitor <alerts@metricmonitor.com>',
      to: toEmail,
      subject: `🚨 Alert: ${trackerName} — ${metric} dropped ${dropPct}%`,
      html: `
        <div style="font-family: 'Inter', sans-serif; max-width: 500px; margin: 0 auto; padding: 32px; background: #0f1117; color: #e4e4e7; border-radius: 16px;">
          <h2 style="margin: 0 0 8px; color: #ef4444; font-size: 20px;">🚨 MetricMonitor Alert</h2>
          <p style="margin: 0 0 24px; color: #a1a1aa; font-size: 14px;">Your tracker <strong style="color: #e4e4e7;">"${trackerName}"</strong> has been triggered.</p>
          
          <div style="background: #1a1b23; padding: 20px; border-radius: 12px; border: 1px solid #27272a;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #a1a1aa; font-size: 13px;">Metric</td>
                <td style="padding: 8px 0; text-align: right; font-weight: 600;">${metric}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #a1a1aa; font-size: 13px;">Expected (Baseline)</td>
                <td style="padding: 8px 0; text-align: right; font-weight: 600;">${baseline.toLocaleString()}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #a1a1aa; font-size: 13px;">Actual (Current)</td>
                <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #ef4444;">${current.toLocaleString()}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #a1a1aa; font-size: 13px;">Drop</td>
                <td style="padding: 8px 0; text-align: right; font-weight: 700; color: #ef4444; font-size: 18px;">${dropPct}%</td>
              </tr>
            </table>
          </div>

          <p style="margin: 24px 0 0; color: #71717a; font-size: 12px;">— MetricMonitor</p>
        </div>
      `
    });
  }

  /**
   * Phase 4.3: Slack Webhook Alerting
   */
  private async sendSlackAlert(webhookUrl: string, trackerName: string, metric: string, current: number, baseline: number) {
    const dropPct = baseline > 0 ? Math.round(((baseline - current) / baseline) * 100) : 0;
    
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: `🚨 ${trackerName}`, emoji: true }
          },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*Metric:*\n${metric}` },
              { type: "mrkdwn", text: `*Drop:*\n${dropPct}%` },
              { type: "mrkdwn", text: `*Expected:*\n${baseline.toLocaleString()}` },
              { type: "mrkdwn", text: `*Actual:*\n${current.toLocaleString()}` }
            ]
          }
        ]
      })
    });
  }

  /**
   * Phase 4.2: Recovery Email via Resend
   */
  private async sendRecoveryEmail(toEmail: string, trackerName: string, metric: string, current: number, baseline: number) {
    const resend = new Resend(this.env.RESEND_API_KEY);
    
    await resend.emails.send({
      from: 'MetricMonitor <alerts@metricmonitor.com>',
      to: toEmail,
      subject: `✅ Resolved: ${trackerName} — ${metric} has recovered`,
      html: `
        <div style="font-family: 'Inter', sans-serif; max-width: 500px; margin: 0 auto; padding: 32px; background: #0f1117; color: #e4e4e7; border-radius: 16px;">
          <h2 style="margin: 0 0 8px; color: #22c55e; font-size: 20px;">✅ MetricMonitor — Resolved</h2>
          <p style="margin: 0 0 24px; color: #a1a1aa; font-size: 14px;">Your tracker <strong style="color: #e4e4e7;">"${trackerName}"</strong> has recovered to normal levels.</p>
          
          <div style="background: #1a1b23; padding: 20px; border-radius: 12px; border: 1px solid #27272a;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #a1a1aa; font-size: 13px;">Metric</td>
                <td style="padding: 8px 0; text-align: right; font-weight: 600;">${metric}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #a1a1aa; font-size: 13px;">Baseline</td>
                <td style="padding: 8px 0; text-align: right; font-weight: 600;">${baseline.toLocaleString()}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #a1a1aa; font-size: 13px;">Current</td>
                <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #22c55e;">${current.toLocaleString()}</td>
              </tr>
            </table>
          </div>

          <p style="margin: 24px 0 0; color: #71717a; font-size: 12px;">— MetricMonitor</p>
        </div>
      `
    });
  }

  /**
   * Phase 4.3: Slack Recovery Notification
   */
  private async sendSlackRecovery(webhookUrl: string, trackerName: string, metric: string, current: number, baseline: number) {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: `✅ Resolved: ${trackerName}`, emoji: true }
          },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*Metric:*\n${metric}` },
              { type: "mrkdwn", text: `*Status:*\nRecovered ✅` },
              { type: "mrkdwn", text: `*Baseline:*\n${baseline.toLocaleString()}` },
              { type: "mrkdwn", text: `*Current:*\n${current.toLocaleString()}` }
            ]
          }
        ]
      })
    });
  }

  /**
   * Phase 4.3: Discord Alert Webhook
   */
  private async sendDiscordAlert(webhookUrl: string, trackerName: string, metric: string, current: number, baseline: number) {
    const dropPct = baseline > 0 ? Math.round(((baseline - current) / baseline) * 100) : 0;
    
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: `🚨 ${trackerName}`,
          color: 0xef4444, // red
          fields: [
            { name: 'Metric', value: metric, inline: true },
            { name: 'Drop', value: `${dropPct}%`, inline: true },
            { name: 'Expected', value: baseline.toLocaleString(), inline: true },
            { name: 'Actual', value: current.toLocaleString(), inline: true }
          ],
          footer: { text: 'MetricMonitor' },
          timestamp: new Date().toISOString()
        }]
      })
    });
  }

  /**
   * Phase 4.3: Discord Recovery Webhook
   */
  private async sendDiscordRecovery(webhookUrl: string, trackerName: string, metric: string, current: number, baseline: number) {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: `✅ Resolved: ${trackerName}`,
          color: 0x22c55e, // green
          fields: [
            { name: 'Metric', value: metric, inline: true },
            { name: 'Status', value: 'Recovered ✅', inline: true },
            { name: 'Baseline', value: baseline.toLocaleString(), inline: true },
            { name: 'Current', value: current.toLocaleString(), inline: true }
          ],
          footer: { text: 'MetricMonitor' },
          timestamp: new Date().toISOString()
        }]
      })
    });
  }
}
