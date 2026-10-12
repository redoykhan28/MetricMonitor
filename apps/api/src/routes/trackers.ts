import { Hono } from 'hono';
import { getDb } from '../db';
import { trackers, properties, workspaces, googleCredentials } from '../db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { Env } from '../index';
import { GA4Service } from '../services/ga4';
import { evaluateRuleDefinition } from '../services/ruleEvaluator';
import { refreshAccessToken } from '../services/monitor';

const trackersRoutes = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

// GET /api/trackers
// List all trackers for the user's workspace
trackersRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const db = getDb(c.env);

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.ownerId, userId)
  });

  if (!workspace) return c.json({ error: 'Workspace not found' }, 404);

  // Get properties for this workspace
  const userProperties = await db.select({
    id: properties.id,
    name: properties.name,
    ga4PropertyId: properties.ga4PropertyId,
    domain: properties.domain
  }).from(properties).where(eq(properties.workspaceId, workspace.id));
  
  if (userProperties.length === 0) {
    return c.json({ trackers: [], properties: [] });
  }

  const propertyIds = userProperties.map(p => p.id);
  const propertyMap = Object.fromEntries(userProperties.map(p => [p.id, p.name]));

  // Get trackers
  const allTrackers = await db.select().from(trackers).where(inArray(trackers.propertyId, propertyIds));

  // Attach property names
  const trackersWithProperty = allTrackers.map(t => ({
    ...t,
    propertyName: propertyMap[t.propertyId] || 'Unknown Property'
  }));

  return c.json({ trackers: trackersWithProperty, properties: userProperties });
});

// POST /api/trackers
// Create a new tracker (supports both legacy single-metric and new compound rule format)
trackersRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const db = getDb(c.env);
  const body = await c.req.json();

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.ownerId, userId)
  });

  if (!workspace) return c.json({ error: 'Workspace not found' }, 404);

  // Validate the property belongs to this workspace
  const property = await db.query.properties.findFirst({
    where: and(
      eq(properties.id, body.propertyId),
      eq(properties.workspaceId, workspace.id)
    )
  });

  if (!property) return c.json({ error: 'Invalid property' }, 400);

  // Validate ruleDefinition if present
  let ruleDefinitionJson: string | null = null;
  if (body.ruleDefinition) {
    try {
      const rule = typeof body.ruleDefinition === 'string'
        ? JSON.parse(body.ruleDefinition)
        : body.ruleDefinition;

      if (!rule.groups || !Array.isArray(rule.groups) || rule.groups.length === 0) {
        return c.json({ error: 'ruleDefinition must have at least one group' }, 400);
      }
      for (const group of rule.groups) {
        if (!group.conditions || !Array.isArray(group.conditions) || group.conditions.length === 0) {
          return c.json({ error: 'Each rule group must have at least one condition' }, 400);
        }
      }
      ruleDefinitionJson = JSON.stringify(rule);
    } catch {
      return c.json({ error: 'ruleDefinition is invalid JSON' }, 400);
    }
  }

  const [newTracker] = await db.insert(trackers).values({
    id: crypto.randomUUID(),
    propertyId: body.propertyId,
    name: body.name,
    // Legacy fields — required for backwards compat, use sensible defaults if compound rule provided
    metric: body.metric || 'sessions',
    condition: body.condition || 'drops_by',
    thresholdValue: body.thresholdValue ?? 0,
    compareWindow: body.compareWindow || 'previous_day',
    // Compound rule
    ruleDefinition: ruleDefinitionJson,
    isActive: true,
  }).returning();

  // Fire notification event
  try {
    const { dispatchEvent } = await import('../services/dispatcher');
    await dispatchEvent(
      c.env,
      workspace.id,
      'tracker_added',
      '🎯 New Tracker Active',
      ruleDefinitionJson
        ? `The compound tracker "${body.name}" is now monitoring your property with ${JSON.parse(ruleDefinitionJson).groups.length} rule group(s).`
        : `The tracker "${body.name}" is now monitoring your property. You will receive alerts if the conditions are met.`,
      { trackerId: newTracker.id }
    );
  } catch (err) {
    console.error('Failed to dispatch tracker_added event', err);
  }

  return c.json({ tracker: newTracker });
});


// DELETE /api/trackers/:id
trackersRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const trackerId = c.req.param('id');
  const db = getDb(c.env);

  // Security: Ensure this tracker belongs to a property in the user's workspace
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.ownerId, userId)
  });

  if (!workspace) return c.json({ error: 'Workspace not found' }, 404);

  const tracker = await db.query.trackers.findFirst({
    where: eq(trackers.id, trackerId)
  });

  if (!tracker) return c.json({ error: 'Tracker not found' }, 404);

  const property = await db.query.properties.findFirst({
    where: and(
      eq(properties.id, tracker.propertyId),
      eq(properties.workspaceId, workspace.id)
    )
  });

  if (!property) return c.json({ error: 'Unauthorized' }, 403);

  await db.delete(trackers).where(eq(trackers.id, trackerId));

  return c.json({ success: true });
});

// PATCH /api/trackers/:id/toggle
trackersRoutes.patch('/:id/toggle', async (c) => {
  const userId = c.get('userId');
  const trackerId = c.req.param('id');
  const db = getDb(c.env);
  const body = await c.req.json();

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.ownerId, userId)
  });

  if (!workspace) return c.json({ error: 'Workspace not found' }, 404);

  const tracker = await db.query.trackers.findFirst({
    where: eq(trackers.id, trackerId)
  });

  if (!tracker) return c.json({ error: 'Tracker not found' }, 404);

  const property = await db.query.properties.findFirst({
    where: and(
      eq(properties.id, tracker.propertyId),
      eq(properties.workspaceId, workspace.id)
    )
  });

  if (!property) return c.json({ error: 'Unauthorized' }, 403);

  const [updatedTracker] = await db.update(trackers)
    .set({ isActive: body.isActive })
    .where(eq(trackers.id, trackerId))
    .returning();

  return c.json({ tracker: updatedTracker });
});

// PUT /api/trackers/:id
// Update an existing tracker (name, conditions, ruleDefinition, cooldown)
trackersRoutes.put('/:id', async (c) => {
  const userId = c.get('userId');
  const trackerId = c.req.param('id');
  const db = getDb(c.env);
  const body = await c.req.json();

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.ownerId, userId)
  });
  if (!workspace) return c.json({ error: 'Workspace not found' }, 404);

  const tracker = await db.query.trackers.findFirst({
    where: eq(trackers.id, trackerId)
  });
  if (!tracker) return c.json({ error: 'Tracker not found' }, 404);

  const property = await db.query.properties.findFirst({
    where: and(
      eq(properties.id, body.propertyId || tracker.propertyId),
      eq(properties.workspaceId, workspace.id)
    )
  });
  if (!property) return c.json({ error: 'Unauthorized property' }, 403);

  // Validate ruleDefinition if present
  let ruleDefinitionJson: string | null = tracker.ruleDefinition;
  if (body.ruleDefinition !== undefined) {
    if (body.ruleDefinition === null) {
      ruleDefinitionJson = null;
    } else {
      try {
        const rule = typeof body.ruleDefinition === 'string'
          ? JSON.parse(body.ruleDefinition)
          : body.ruleDefinition;
        if (!rule.groups || !Array.isArray(rule.groups) || rule.groups.length === 0) {
          return c.json({ error: 'ruleDefinition must have at least one group' }, 400);
        }
        ruleDefinitionJson = JSON.stringify(rule);
      } catch {
        return c.json({ error: 'Invalid ruleDefinition JSON' }, 400);
      }
    }
  }

  const [updatedTracker] = await db.update(trackers)
    .set({
      name: body.name ?? tracker.name,
      propertyId: body.propertyId ?? tracker.propertyId,
      metric: body.metric ?? tracker.metric,
      condition: body.condition ?? tracker.condition,
      thresholdValue: body.thresholdValue ?? tracker.thresholdValue,
      compareWindow: body.compareWindow ?? tracker.compareWindow,
      ruleDefinition: ruleDefinitionJson,
      cooldownHours: body.cooldownHours ?? tracker.cooldownHours,
    })
    .where(eq(trackers.id, trackerId))
    .returning();

  return c.json({ tracker: updatedTracker });
});

// POST /api/trackers/test-rule
// Test evaluates a rule definition in real time against live GA4 data
trackersRoutes.post('/test-rule', async (c) => {
  const userId = c.get('userId');
  const db = getDb(c.env);
  const body = await c.req.json();

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.ownerId, userId)
  });
  if (!workspace) return c.json({ error: 'Workspace not found' }, 404);

  const property = await db.query.properties.findFirst({
    where: and(
      eq(properties.id, body.propertyId),
      eq(properties.workspaceId, workspace.id)
    )
  });
  if (!property) return c.json({ error: 'Property not found' }, 404);

  const credentials = await db.query.googleCredentials.findFirst({
    where: eq(googleCredentials.workspaceId, workspace.id)
  });

  if (!credentials) {
    return c.json({
      success: true,
      simulated: true,
      evaluation: {
        triggered: false,
        summary: 'Google Analytics account not connected yet. Connect Google to test against live traffic.',
        conditionResults: [],
      }
    });
  }

  let accessToken = credentials.accessToken;
  if (credentials.expiresAt && credentials.expiresAt < new Date()) {
    try {
      accessToken = await refreshAccessToken(c.env, workspace.id, credentials.refreshToken);
    } catch (e: any) {
      return c.json({ error: `Google token refresh failed: ${e.message}` }, 400);
    }
  }

  const ga4 = new GA4Service(accessToken, c.env.METRIC_CACHE);
  const ruleDefinition = typeof body.ruleDefinition === 'string'
    ? JSON.parse(body.ruleDefinition)
    : body.ruleDefinition;

  try {
    const evaluation = await evaluateRuleDefinition(
      ruleDefinition,
      body.name || 'Test Tracker',
      property.ga4PropertyId,
      ga4
    );
    return c.json({ success: true, evaluation });
  } catch (err: any) {
    return c.json({ error: `Evaluation error: ${err.message}` }, 500);
  }
});

// POST /api/trackers/:id/test
// Test evaluates an existing saved tracker on demand
trackersRoutes.post('/:id/test', async (c) => {
  const userId = c.get('userId');
  const trackerId = c.req.param('id');
  const db = getDb(c.env);

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.ownerId, userId)
  });
  if (!workspace) return c.json({ error: 'Workspace not found' }, 404);

  const tracker = await db.query.trackers.findFirst({
    where: eq(trackers.id, trackerId)
  });
  if (!tracker) return c.json({ error: 'Tracker not found' }, 404);

  const property = await db.query.properties.findFirst({
    where: and(
      eq(properties.id, tracker.propertyId),
      eq(properties.workspaceId, workspace.id)
    )
  });
  if (!property) return c.json({ error: 'Unauthorized' }, 403);

  const credentials = await db.query.googleCredentials.findFirst({
    where: eq(googleCredentials.workspaceId, workspace.id)
  });
  if (!credentials) return c.json({ error: 'Google credentials not found' }, 400);

  let accessToken = credentials.accessToken;
  if (credentials.expiresAt && credentials.expiresAt < new Date()) {
    accessToken = await refreshAccessToken(c.env, workspace.id, credentials.refreshToken);
  }

  const ga4 = new GA4Service(accessToken, c.env.METRIC_CACHE);

  if (tracker.ruleDefinition) {
    const rule = JSON.parse(tracker.ruleDefinition);
    const evaluation = await evaluateRuleDefinition(rule, tracker.name, property.ga4PropertyId, ga4);
    return c.json({ success: true, evaluation });
  } else {
    // Legacy single-metric evaluation — mirrors the monitoring engine logic exactly
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];
    const sevenDaysAgo = new Date(Date.now() - 8 * 86_400_000).toISOString().split('T')[0];
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString().split('T')[0];
    const sameDayLastWeek = new Date(Date.now() - 7 * 86_400_000).toISOString().split('T')[0];

    const currentData = await ga4.getMetric(property.ga4PropertyId, tracker.metric, yesterday, yesterday);
    const current = parseFloat(currentData.rows?.[0]?.metricValues?.[0]?.value || '0');

    let baseline = 0;
    if (tracker.compareWindow === 'avg_7_days') {
      const baselineData = await ga4.getMetric(property.ga4PropertyId, tracker.metric, sevenDaysAgo, twoDaysAgo);
      const rows = baselineData.rows || [];
      if (rows.length > 0) {
        const total = rows.reduce((sum: number, row: any) => sum + parseFloat(row.metricValues?.[0]?.value || '0'), 0);
        baseline = total / rows.length;
      }
    } else if (tracker.compareWindow === 'same_day_last_week') {
      const baselineData = await ga4.getMetric(property.ga4PropertyId, tracker.metric, sameDayLastWeek, sameDayLastWeek);
      baseline = parseFloat(baselineData.rows?.[0]?.metricValues?.[0]?.value || '0');
    } else {
      // previous_day: yesterday vs day-before-yesterday
      const baselineData = await ga4.getMetric(property.ga4PropertyId, tracker.metric, twoDaysAgo, twoDaysAgo);
      baseline = parseFloat(baselineData.rows?.[0]?.metricValues?.[0]?.value || '0');
    }

    let triggered = false;
    let summary = '';

    if (tracker.condition === 'drops_by') {
      const dropPct = baseline > 0 ? ((baseline - current) / baseline) * 100 : 0;
      triggered = baseline > 0 && dropPct >= tracker.thresholdValue;
      summary = `${tracker.metric}: ${current.toLocaleString()} (baseline: ${baseline.toLocaleString()}, drop: ${dropPct.toFixed(1)}%, threshold: ${tracker.thresholdValue}%)`;
    } else if (tracker.condition === 'spikes_by') {
      const spikePct = baseline > 0 ? ((current - baseline) / baseline) * 100 : 0;
      triggered = baseline > 0 && spikePct >= tracker.thresholdValue;
      summary = `${tracker.metric}: ${current.toLocaleString()} (baseline: ${baseline.toLocaleString()}, spike: ${spikePct.toFixed(1)}%, threshold: ${tracker.thresholdValue}%)`;
    } else if (tracker.condition === 'greater_than') {
      triggered = current > tracker.thresholdValue;
      summary = `${tracker.metric}: ${current.toLocaleString()} > ${tracker.thresholdValue}`;
    } else if (tracker.condition === 'less_than') {
      triggered = current < tracker.thresholdValue;
      summary = `${tracker.metric}: ${current.toLocaleString()} < ${tracker.thresholdValue}`;
    } else if (tracker.condition === 'equals') {
      triggered = current === tracker.thresholdValue;
      summary = `${tracker.metric}: ${current.toLocaleString()} = ${tracker.thresholdValue}`;
    } else if (tracker.condition === 'not_equals') {
      triggered = current !== tracker.thresholdValue;
      summary = `${tracker.metric}: ${current.toLocaleString()} ≠ ${tracker.thresholdValue}`;
    }

    return c.json({
      success: true,
      evaluation: {
        triggered,
        summary: `${triggered ? '🚨 Alert triggered — ' : '✅ Normal — '}${summary}`,
        conditionResults: [{
          condition: { id: 'legacy', type: 'metric', metric: tracker.metric, operator: tracker.condition, thresholdValue: tracker.thresholdValue, compareWindow: tracker.compareWindow },
          actualValue: current,
          baselineValue: ['drops_by', 'spikes_by'].includes(tracker.condition) ? baseline : undefined,
          passed: triggered,
        }],
      }
    });
  }
});

export default trackersRoutes;
