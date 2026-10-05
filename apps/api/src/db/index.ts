import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';

export function getDb(env: { TURSO_URL: string; TURSO_AUTH_TOKEN: string }) {
  const client = createClient({
    url: env.TURSO_URL,
    authToken: env.TURSO_AUTH_TOKEN,
  });
  
  return drizzle(client, { schema });
}
