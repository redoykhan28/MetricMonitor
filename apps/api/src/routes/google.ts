import { Hono } from 'hono';
import { getDb } from '../db';
import { googleCredentials, workspaces } from '../db/schema';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';

const googleRoutes = new Hono<{ Bindings: any; Variables: { userId: string } }>();

// Ensure all Google routes are protected by Clerk Auth
googleRoutes.use('*', requireAuth);

// 1. Initiate OAuth Flow (Returns the URL to the frontend)
googleRoutes.post('/connect-url', async (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID;
  const redirectUri = `${new URL(c.req.url).origin}/api/google/callback`;
  
  // The state parameter securely passes through the Clerk userId
  const state = c.get('userId'); 

  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=https://www.googleapis.com/auth/analytics.readonly&access_type=offline&prompt=consent&state=${state}`;

  return c.json({ url });
});

// 2. Handle OAuth Callback
googleRoutes.get('/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state'); // The Clerk user ID

  if (!code || !state) {
    return c.json({ error: 'Missing code or state parameter' }, 400);
  }

  const clientId = c.env.GOOGLE_CLIENT_ID;
  const clientSecret = c.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${new URL(c.req.url).origin}/api/google/callback`;

  try {
    // Exchange the authorization code for an access token & refresh token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenResponse.json() as any;

    if (!tokenResponse.ok) {
      throw new Error(tokens.error_description || 'Failed to fetch tokens');
    }

    const db = getDb(c.env);

    // Look up the workspace associated with this user
    let userWorkspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.ownerId, state)
    });

    if (!userWorkspace) {
      throw new Error("No workspace found for this user. Please load the dashboard first.");
    }

    // Save tokens securely in Turso attached to the correct workspace ID
    await db.insert(googleCredentials).values({
      id: crypto.randomUUID(),
      workspaceId: userWorkspace.id, // Correctly use the workspace ID, not the user ID
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      email: 'user@google.com', // In production, call userinfo API to get this
    }).onConflictDoUpdate({
      target: googleCredentials.workspaceId,
      set: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        updatedAt: new Date(),
      }
    });

    // Redirect the popup to a simple auto-close page
    return c.redirect('http://localhost:5173/oauth-success.html');

  } catch (error: any) {
    console.error('Google OAuth Error:', error);
    return c.json({ error: 'OAuth failed', details: error.message }, 500);
  }
});
import { properties } from '../db/schema';

// 3. List GA4 Properties from Google (fetches from GA Admin API)
googleRoutes.get('/properties', async (c) => {
  const userId = c.get('userId');
  const db = getDb(c.env);

  // Find the user's workspace and credentials
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.ownerId, userId)
  });

  if (!workspace) {
    return c.json({ error: 'No workspace found' }, 404);
  }

  const creds = await db.query.googleCredentials.findFirst({
    where: eq(googleCredentials.workspaceId, workspace.id)
  });

  if (!creds) {
    return c.json({ error: 'Google not connected', isConnected: false }, 400);
  }

  try {
    // Auto-refresh token if expired
    let accessToken = creds.accessToken;
    if (creds.expiresAt && creds.expiresAt < new Date()) {
      const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: c.env.GOOGLE_CLIENT_ID,
          client_secret: c.env.GOOGLE_CLIENT_SECRET,
          refresh_token: creds.refreshToken,
          grant_type: 'refresh_token',
        }),
      });
      const newTokens = await refreshRes.json() as any;
      if (newTokens.access_token) {
        accessToken = newTokens.access_token;
        await db.update(googleCredentials)
          .set({
            accessToken: newTokens.access_token,
            expiresAt: new Date(Date.now() + (newTokens.expires_in || 3600) * 1000),
            updatedAt: new Date(),
          })
          .where(eq(googleCredentials.workspaceId, workspace.id));
      }
    }

    // Fetch GA4 account summaries
    const response = await fetch(
      'https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const rawText = await response.text();
    let data: any = {};
    try { data = JSON.parse(rawText); } catch { /* ignore */ }

    // Log to wrangler console so we can debug
    console.log(`[GA4 Properties] HTTP ${response.status} | accounts: ${(data.accountSummaries || []).length} | error: ${data.error?.message || 'none'}`);

    if (!response.ok) {
      return c.json({
        accounts: [],
        error: data.error?.message || `Google API error (${response.status})`,
        hint: response.status === 403
          ? 'The connected Google account lacks access to GA4, OR the Google Analytics Admin API is not enabled in your GCP project.'
          : response.status === 401
          ? 'Your Google session expired. Please disconnect and reconnect Google.'
          : 'Unexpected error from Google. Check the API logs.'
      });
    }

    const accounts = data.accountSummaries || [];
    return c.json({ accounts });

  } catch (error: any) {
    console.error('Failed to fetch GA4 properties:', error);
    return c.json({ error: error.message }, 500);
  }
});

// 4. Add a GA4 property to monitor
googleRoutes.post('/properties/add', async (c) => {
  const userId = c.get('userId');
  const db = getDb(c.env);
  const body = await c.req.json() as { ga4PropertyId: string; name: string; domain?: string };

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.ownerId, userId)
  });

  if (!workspace) {
    return c.json({ error: 'No workspace found' }, 404);
  }

  // Check if property already exists
  const existing = await db.query.properties.findFirst({
    where: eq(properties.ga4PropertyId, body.ga4PropertyId)
  });

  if (existing) {
    return c.json({ error: 'This property is already being monitored', property: existing }, 409);
  }

  const [newProperty] = await db.insert(properties).values({
    id: crypto.randomUUID(),
    workspaceId: workspace.id,
    name: body.name,
    ga4PropertyId: body.ga4PropertyId,
    domain: body.domain || null,
  }).returning();

  // Fire notification event
  try {
    const { dispatchEvent } = await import('../services/dispatcher');
    await dispatchEvent(
      c.env,
      workspace.id,
      'ga4_added',
      '✅ New GA4 Property Connected',
      `You have successfully connected the GA4 property "${body.name}" to MetricMonitor. You can now create trackers for it.`,
      { propertyId: body.ga4PropertyId }
    );
  } catch (err) {
    console.error('Failed to dispatch ga4_added event', err);
  }

  return c.json({ property: newProperty });
});

export default googleRoutes;
