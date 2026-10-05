import { Hono } from 'hono';
import { getDb } from '../db';
import { trackers, properties, trackerEvents, workspaces, users, googleCredentials } from '../db/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { Env } from '../index';

const dashboardRoutes = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

dashboardRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const db = getDb(c.env);

  // 1. Ensure the user exists in our DB
  let userRecord = await db.query.users.findFirst({
    where: eq(users.id, userId)
  });
  
  if (!userRecord) {
    await db.insert(users).values({
      id: userId,
      email: 'user@example.com'
    }).onConflictDoNothing();
  }

  // 2. Get the user's workspace
  let userWorkspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.ownerId, userId)
  });

  if (!userWorkspace) {
    const [newWorkspace] = await db.insert(workspaces).values({
      id: crypto.randomUUID(),
      ownerId: userId,
      name: 'My Workspace'
    }).returning();
    userWorkspace = newWorkspace;
  }

  const workspaceId = userWorkspace.id;

  // 3. Check if Google is connected
  const googleCred = await db.query.googleCredentials.findFirst({
    where: eq(googleCredentials.workspaceId, workspaceId)
  });

  const isGoogleConnected = !!googleCred;

  // 4. Count monitored properties
  const [propertiesCount] = await db.select({ count: sql`count(*)` })
    .from(properties)
    .where(eq(properties.workspaceId, workspaceId));

  const numProperties = Number(propertiesCount?.count || 0);

  // If no properties, return early with connection status
  if (numProperties === 0) {
    return c.json({
      workspaceId,
      isGoogleConnected,
      stats: { activeTrackers: 0, monitoredProperties: 0, recentAlerts: 0 }
    });
  }

  // Get all property IDs for this workspace
  const userProperties = await db.select({ id: properties.id })
    .from(properties)
    .where(eq(properties.workspaceId, workspaceId));
  
  const propertyIds = userProperties.map(p => p.id);

  // 5. Count active trackers
  const [trackersCount] = await db.select({ count: sql`count(*)` })
    .from(trackers)
    .where(and(inArray(trackers.propertyId, propertyIds), eq(trackers.isActive, 1)));

  // 6. Count recent alerts
  const [alertsCount] = await db.select({ count: sql`count(*)` })
    .from(trackerEvents)
    .where(inArray(trackerEvents.propertyId, propertyIds));

  return c.json({
    workspaceId,
    isGoogleConnected,
    stats: {
      activeTrackers: Number(trackersCount?.count || 0),
      monitoredProperties: numProperties,
      recentAlerts: Number(alertsCount?.count || 0)
    }
  });
});

// GET /api/dashboard/properties
// Returns a list of properties for dropdowns (tracker creation form)
dashboardRoutes.get('/properties', async (c) => {
  const userId = c.get('userId');
  const db = getDb(c.env);

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.ownerId, userId)
  });

  if (!workspace) return c.json({ properties: [] });

  const userProperties = await db.select({
    id: properties.id,
    name: properties.name
  }).from(properties).where(eq(properties.workspaceId, workspace.id));

  return c.json({ properties: userProperties });
});

// GET /api/dashboard/chart-data
// Fetches real GA4 activeUsers data for the last 7 days for the user's first property
dashboardRoutes.get('/chart-data', async (c) => {
  const userId = c.get('userId');
  const db = getDb(c.env);

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.ownerId, userId)
  });

  if (!workspace) return c.json({ chartData: [] });

  // Get Google credentials
  const credentials = await db.query.googleCredentials.findFirst({
    where: eq(googleCredentials.workspaceId, workspace.id)
  });

  if (!credentials) return c.json({ chartData: [] });

  // Get the first property
  const property = await db.query.properties.findFirst({
    where: eq(properties.workspaceId, workspace.id)
  });

  if (!property) return c.json({ chartData: [] });

  // Refresh token if expired
  let accessToken = credentials.accessToken;
  if (credentials.expiresAt && credentials.expiresAt < new Date()) {
    try {
      const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: c.env.GOOGLE_CLIENT_ID || '',
          client_secret: c.env.GOOGLE_CLIENT_SECRET || '',
          refresh_token: credentials.refreshToken,
          grant_type: 'refresh_token'
        })
      });
      const tokenData = await refreshRes.json() as any;
      if (tokenData.access_token) {
        accessToken = tokenData.access_token;
        await db.update(googleCredentials)
          .set({
            accessToken: tokenData.access_token,
            expiresAt: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000)
          })
          .where(eq(googleCredentials.workspaceId, workspace.id));
      }
    } catch (err) {
      console.error('[Chart] Token refresh failed:', err);
      return c.json({ chartData: [], error: 'Token refresh failed' });
    }
  }

  const formatDate = (d: Date) => d.toISOString().split('T')[0];

  // Support dynamic date range via query params, default to last 7 days
  const endDateParam = c.req.query('endDate');
  const startDateParam = c.req.query('startDate');

  const endDate = endDateParam ? new Date(endDateParam) : new Date();
  const startDate = startDateParam 
    ? new Date(startDateParam) 
    : new Date(Date.now() - 6 * 86400000); // default: 7 days

  try {
    const ga4Res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${property.ga4PropertyId}:runReport`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          dateRanges: [{ startDate: formatDate(startDate), endDate: formatDate(endDate) }],
          dimensions: [{ name: 'date' }],
          metrics: [
            { name: 'activeUsers' },
            { name: 'sessions' }
          ],
          orderBys: [{ dimension: { dimensionName: 'date' }, desc: false }]
        })
      }
    );

    if (!ga4Res.ok) {
      const errorText = await ga4Res.text();
      console.error(`[Chart] GA4 Data API error: HTTP ${ga4Res.status} | property: ${property.ga4PropertyId} | ${errorText.substring(0, 300)}`);
      return c.json({ chartData: [], error: `GA4 Data API error (${ga4Res.status})`, detail: errorText.substring(0, 200) });
    }

    const ga4Data = await ga4Res.json() as any;
    console.log(`[Chart] GA4 success | property: ${property.ga4PropertyId} | rows: ${(ga4Data.rows || []).length}`);

    const chartData = (ga4Data.rows || []).map((row: any) => {
      const rawDate = row.dimensionValues?.[0]?.value || '';
      // GA4 returns dates as YYYYMMDD, format to readable
      const year = rawDate.substring(0, 4);
      const month = rawDate.substring(4, 6);
      const day = rawDate.substring(6, 8);
      const dateObj = new Date(`${year}-${month}-${day}`);
      const label = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

      return {
        date: label,
        activeUsers: parseInt(row.metricValues?.[0]?.value || '0', 10),
        sessions: parseInt(row.metricValues?.[1]?.value || '0', 10)
      };
    });

    return c.json({ chartData, propertyName: property.name });
  } catch (err) {
    console.error('[Chart] Fetch error:', err);
    return c.json({ chartData: [], error: 'Failed to fetch GA4 data' });
  }
});

export default dashboardRoutes;
