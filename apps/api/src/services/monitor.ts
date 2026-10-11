import { Env } from '../index';
import { getDb } from '../db';
import {
  properties, trackers, trackerEvents,
  googleCredentials, users, workspaces, workspaceSettings,
} from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { GA4Service } from './ga4';
import { dispatchAlert, dispatchRecovery, dispatchEvent } from './dispatcher';

// ─── Error Types ──────────────────────────────────────────────────────────────
class RevokedTokenError extends Error {
  constructor(workspaceId: string) {
    super(`Google token revoked or invalid for workspace ${workspaceId}`);
    this.name = 'RevokedTokenError';
  }
}

class GA4QuotaError extends Error {
  constructor() {
    super('GA4 API quota exhausted — backing off');
    this.name = 'GA4QuotaError';
  }
}

// ─── Token Refresh Utility ────────────────────────────────────────────────────
async function refreshAccessToken(env: Env, workspaceId: string, refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID || '',
      client_secret: env.GOOGLE_CLIENT_SECRET || '',
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const data = await res.json() as any;

  // Detect revoked / invalid token
  if (!res.ok || data.error) {
    if (data.error === 'invalid_grant' || data.error === 'token_revoked') {
      throw new RevokedTokenError(workspaceId);
    }
    throw new Error(`Token refresh failed: ${data.error || res.status}`);
  }

  // Persist refreshed token
  const db = getDb(env);
  await db.update(googleCredentials)
    .set({
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
    })
    .where(eq(googleCredentials.workspaceId, workspaceId));

  return data.access_token;
}

// ─── Monitoring Engine ────────────────────────────────────────────────────────
export class MonitoringEngine {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  /**
   * Phase 3.2: The Producer (Cron Trigger)
   * Reads all active properties and fans them out to the Cloudflare Queue.
   */
  async enqueueActiveProperties(): Promise<void> {
    const db = getDb(this.env);

    const activeProperties = await db
      .select({
        id: properties.id,
        ga4PropertyId: properties.ga4PropertyId,
        workspaceId: properties.workspaceId,
        name: properties.name,
      })
      .from(properties)
      .innerJoin(trackers, eq(properties.id, trackers.propertyId))
      .where(eq(trackers.isActive, true))
      .groupBy(properties.id);

    console.log(`[Producer] Enqueueing ${activeProperties.length} active properties.`);

    for (const prop of activeProperties) {
      await this.env.MONITOR_QUEUE.send({
        propertyId: prop.id,
        ga4PropertyId: prop.ga4PropertyId,
        workspaceId: prop.workspaceId,
        propertyName: prop.name,
      });
    }
  }

  /**
   * Phase 3.3: The Consumer (Queue Worker)
   * Processes ONE property per invocation. Evaluates all its trackers.
   * Cloudflare Queues automatically retry on failure (max_retries = 3 in wrangler.toml).
   */
  async processProperty(
    propertyId: string,
    ga4PropertyId: string,
    workspaceId: string,
    propertyName?: string,
  ): Promise<void> {
    const db = getDb(this.env);

    // ── 1. Check if notifications are globally enabled ──
    const settings = await db.query.workspaceSettings.findFirst({
      where: eq(workspaceSettings.workspaceId, workspaceId),
    });

    if (settings && !settings.enableNotifications) {
      console.log(`[Consumer] Notifications disabled for workspace ${workspaceId}. Skipping.`);
      return;
    }

    // ── 2. Get Google credentials ──
    const credentials = await db.query.googleCredentials.findFirst({
      where: eq(googleCredentials.workspaceId, workspaceId),
    });

    if (!credentials) {
      console.warn(`[Consumer] No credentials for workspace ${workspaceId}. Skipping.`);
      return;
    }

    // ── 3. Refresh token if expired — Phase 6.1 ──
    let accessToken = credentials.accessToken;

    if (credentials.expiresAt && credentials.expiresAt < new Date()) {
      try {
        console.log(`[Consumer] Refreshing token for workspace ${workspaceId}...`);
        accessToken = await refreshAccessToken(this.env, workspaceId, credentials.refreshToken);
      } catch (err) {
        if (err instanceof RevokedTokenError) {
          // ── Phase 6.1: Alert user their Google connection is broken ──
          console.error(`[Consumer] REVOKED TOKEN for workspace ${workspaceId}. Alerting user.`);
          await this._handleRevokedToken(workspaceId, settings);
          return; // Stop processing — no point continuing without valid token
        }
        // For other token errors, throw so Queue retries it
        throw err;
      }
    }

    const ga4 = new GA4Service(accessToken, this.env.METRIC_CACHE);

    // ── 4. Get active trackers for this property ──
    const activeTrackers = await db
      .select()
      .from(trackers)
      .where(and(eq(trackers.propertyId, propertyId), eq(trackers.isActive, true)));

    if (activeTrackers.length === 0) return;

    // ── 5. Evaluate each tracker ──
    for (const tracker of activeTrackers) {
      try {
        await this._evaluateTracker(
          tracker, propertyId, ga4PropertyId, workspaceId, propertyName, settings, ga4
        );
      } catch (err) {
        if (err instanceof GA4QuotaError) {
          // Phase 6.2: Quota hit — log and stop processing remaining trackers for this property
          console.warn(`[Consumer] GA4 quota exhausted for property ${propertyId}. Stopping batch.`);
          break;
        }
        // Other errors: log and continue to next tracker (don't fail the whole batch)
        console.error(`[Consumer] Error evaluating tracker "${tracker.name}" (${tracker.id}):`, err);
      }
    }
  }

  // ─── Evaluates a single tracker ────────────────────────────────────────────
  private async _evaluateTracker(
    tracker: any,
    propertyId: string,
    ga4PropertyId: string,
    workspaceId: string,
    propertyName: string | undefined,
    settings: any,
    ga4: GA4Service,
  ): Promise<void> {
    const db = getDb(this.env);
    const cooldownHours = settings?.globalCooldownHours || tracker.cooldownHours || 4;

    // Check cooldown
    if (tracker.lastTriggeredAt) {
      const hoursSince = (Date.now() - new Date(tracker.lastTriggeredAt).getTime()) / 3_600_000;
      if (hoursSince < cooldownHours) {
        console.log(`[Consumer] Tracker "${tracker.name}" in cooldown (${hoursSince.toFixed(1)}h / ${cooldownHours}h). Skipping.`);
        return;
      }
    }

    // Calculate date windows
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().split('T')[0];

    // Fetch current metric
    const currentData = await this._fetchGA4(ga4, ga4PropertyId, tracker.metric, today, today);
    const currentValue = parseFloat(currentData.rows?.[0]?.metricValues?.[0]?.value || '0');

    // Fetch baseline
    let baselineValue = 0;
    if (tracker.compareWindow === 'avg_7_days') {
      const baselineData = await this._fetchGA4(ga4, ga4PropertyId, tracker.metric, sevenDaysAgo, yesterday);
      const rows = baselineData.rows || [];
      if (rows.length > 0) {
        const total = rows.reduce((sum: number, row: any) => sum + parseFloat(row.metricValues?.[0]?.value || '0'), 0);
        baselineValue = total / rows.length;
      }
    } else {
      const baselineData = await this._fetchGA4(ga4, ga4PropertyId, tracker.metric, yesterday, yesterday);
      baselineValue = parseFloat(baselineData.rows?.[0]?.metricValues?.[0]?.value || '0');
    }

    // Evaluate condition
    let isTriggered = false;
    if (tracker.condition === 'drops_by' && baselineValue > 0) {
      const dropPct = ((baselineValue - currentValue) / baselineValue) * 100;
      isTriggered = dropPct >= tracker.thresholdValue;
    } else if (tracker.condition === 'greater_than') {
      isTriggered = currentValue > tracker.thresholdValue;
    } else if (tracker.condition === 'less_than') {
      isTriggered = currentValue < tracker.thresholdValue;
    }

    // Build notification recipients list
    const workspace = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
    const user = workspace ? await db.query.users.findFirst({ where: eq(users.id, workspace.ownerId) }) : null;
    const alertEmails: string[] = settings?.alertEmails
      ? settings.alertEmails.split(',').map((e: string) => e.trim()).filter(Boolean)
      : (user?.email ? [user.email] : []);

    if (isTriggered) {
      console.log(`[ALERT] "${tracker.name}" triggered! Current: ${currentValue}, Baseline: ${baselineValue}`);

      await db.insert(trackerEvents).values({
        id: crypto.randomUUID(),
        trackerId: tracker.id,
        propertyId,
        expectedValue: baselineValue.toString(),
        actualValue: currentValue.toString(),
        status: 'triggered',
        notifiedVia: alertEmails.length > 0 ? 'email' : (settings?.discordWebhookUrl ? 'discord' : 'in_app'),
      });

      await db.update(trackers).set({ lastTriggeredAt: new Date() }).where(eq(trackers.id, tracker.id));

      await dispatchAlert(this.env, workspaceId, {
        trackerName: tracker.name,
        metric: tracker.metric,
        current: currentValue,
        baseline: baselineValue,
        propertyName: propertyName,
        emails: alertEmails,
        discordWebhookUrl: settings?.discordWebhookUrl,
      });

    } else if (tracker.lastTriggeredAt) {
      // Recovery detected
      console.log(`[RECOVERY] "${tracker.name}" has recovered. Current: ${currentValue}`);

      await db.insert(trackerEvents).values({
        id: crypto.randomUUID(),
        trackerId: tracker.id,
        propertyId,
        expectedValue: baselineValue.toString(),
        actualValue: currentValue.toString(),
        status: 'resolved',
        notifiedVia: 'email',
      });

      await db.update(trackers).set({ lastTriggeredAt: null }).where(eq(trackers.id, tracker.id));

      await dispatchRecovery(this.env, workspaceId, {
        trackerName: tracker.name,
        metric: tracker.metric,
        current: currentValue,
        baseline: baselineValue,
        propertyName: propertyName,
        emails: alertEmails,
        discordWebhookUrl: settings?.discordWebhookUrl,
      });
    }
  }

  // ─── Phase 6.2: Quota-aware GA4 fetcher ─────────────────────────────────────
  private async _fetchGA4(ga4: GA4Service, propertyId: string, metric: string, start: string, end: string): Promise<any> {
    const data = await ga4.getMetric(propertyId, metric, start, end);

    // Detect quota exhaustion from GA4 API response
    if (data?.error?.status === 'RESOURCE_EXHAUSTED' || data?.error?.code === 429) {
      throw new GA4QuotaError();
    }
    return data;
  }

  // ─── Phase 6.1: Handle revoked Google OAuth token ────────────────────────────
  private async _handleRevokedToken(workspaceId: string, settings: any): Promise<void> {
    const db = getDb(this.env);

    // Pause all active trackers for this workspace to prevent future failures
    const workspaceProperties = await db
      .select({ id: properties.id })
      .from(properties)
      .where(eq(properties.workspaceId, workspaceId));

    for (const prop of workspaceProperties) {
      await db.update(trackers)
        .set({ isActive: false })
        .where(eq(trackers.propertyId, prop.id));
    }

    console.log(`[Consumer] All trackers paused for workspace ${workspaceId} due to revoked token.`);

    // Notify user via email + in-app notification
    await dispatchEvent(
      this.env,
      workspaceId,
      'revoked_token',
      '⚠️ Action Required — Reconnect Google Analytics',
      'Your Google Analytics connection has expired or been revoked. All trackers have been paused. Please reconnect to resume monitoring.',
    );
  }
}
