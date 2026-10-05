import { Hono } from 'hono';
import { getDb } from '../db';
import { trackerEvents, trackers, properties, workspaces } from '../db/schema';
import { eq, inArray, desc } from 'drizzle-orm';
import { Env } from '../index';

const alertsRoutes = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

// GET /api/alerts
// Returns real tracker_events from the database for this user's workspace
alertsRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const db = getDb(c.env);

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.ownerId, userId)
  });

  if (!workspace) return c.json({ alerts: [] });

  // Get all properties for this workspace
  const userProperties = await db.select({
    id: properties.id,
    name: properties.name
  }).from(properties).where(eq(properties.workspaceId, workspace.id));

  if (userProperties.length === 0) return c.json({ alerts: [] });

  const propertyIds = userProperties.map(p => p.id);
  const propertyMap = Object.fromEntries(userProperties.map(p => [p.id, p.name]));

  // Get all events for these properties, ordered by most recent
  const events = await db.select()
    .from(trackerEvents)
    .where(inArray(trackerEvents.propertyId, propertyIds))
    .orderBy(desc(trackerEvents.createdAt))
    .limit(50);

  // Get tracker names
  const trackerIds = [...new Set(events.map(e => e.trackerId))];
  let trackerMap: Record<string, string> = {};
  
  if (trackerIds.length > 0) {
    const trackerRecords = await db.select({
      id: trackers.id,
      name: trackers.name
    }).from(trackers).where(inArray(trackers.id, trackerIds));
    
    trackerMap = Object.fromEntries(trackerRecords.map(t => [t.id, t.name]));
  }

  const alerts = events.map(e => ({
    id: e.id,
    trackerName: trackerMap[e.trackerId] || 'Unknown Tracker',
    propertyName: propertyMap[e.propertyId] || 'Unknown Property',
    expectedValue: e.expectedValue,
    actualValue: e.actualValue,
    status: e.status,
    notifiedVia: e.notifiedVia,
    createdAt: e.createdAt?.toISOString() || new Date().toISOString()
  }));

  return c.json({ alerts });
});

export default alertsRoutes;
