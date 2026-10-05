import { Hono } from 'hono';
import { getDb } from '../db';
import { trackers, properties, workspaces } from '../db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { Env } from '../index';

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
  const userProperties = await db.select({ id: properties.id, name: properties.name }).from(properties).where(eq(properties.workspaceId, workspace.id));
  
  if (userProperties.length === 0) {
    return c.json({ trackers: [] });
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

  return c.json({ trackers: trackersWithProperty });
});

// POST /api/trackers
// Create a new tracker
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

  const [newTracker] = await db.insert(trackers).values({
    id: crypto.randomUUID(),
    propertyId: body.propertyId,
    name: body.name,
    metric: body.metric,
    condition: body.condition,
    thresholdValue: body.thresholdValue,
    compareWindow: body.compareWindow,
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
      `The tracker "${body.name}" is now monitoring your property. You will receive alerts if the conditions are met.`,
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

export default trackersRoutes;
