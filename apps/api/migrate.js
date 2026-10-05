import { createClient } from '@libsql/client';
import fs from 'node:fs';

const envText = fs.readFileSync('.env', 'utf-8');
const env = Object.fromEntries(envText.split('\n').map(line => line.split('=')));

const client = createClient({
  url: env.TURSO_URL.replace(/['"]/g, '').trim(),
  authToken: env.TURSO_AUTH_TOKEN.replace(/['"]/g, '').trim(),
});

async function run() {
  try {
    await client.execute(`ALTER TABLE workspace_settings ADD COLUMN email_on_welcome INTEGER DEFAULT 1;`);
    await client.execute(`ALTER TABLE workspace_settings ADD COLUMN email_on_ga4_added INTEGER DEFAULT 0;`);
    await client.execute(`ALTER TABLE workspace_settings ADD COLUMN email_on_tracker_added INTEGER DEFAULT 0;`);
  } catch (e) {
    console.log('Columns might already exist', e.message);
  }
  
  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        type TEXT NOT NULL,
        is_read INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch (e) {
    console.log('Error creating table', e.message);
  }
  console.log('Schema update complete!');
}
run();
