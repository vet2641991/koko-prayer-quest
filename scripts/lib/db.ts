// Database connection for the jobs (import / export). They run in GitHub Actions with secrets, never in a browser.
//
// The connection string comes from, in order:
//   1. DATABASE_URL (a local test database, or the URL the workflow builds);
//   2. supabase/.temp/pooler-url, written by `supabase link`, plus SUPABASE_DB_PASSWORD.
// Supabase connections are TLS-verified against Supabase's public root CA (supabase/prod-ca-2021.crt).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

export function databaseUrl(root: string): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const poolerFile = join(root, 'supabase/.temp/pooler-url');
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (existsSync(poolerFile) && password) {
    const url = new URL(readFileSync(poolerFile, 'utf8').trim());
    url.password = password;
    url.port = '5432';   // session mode: one connection keeps our transaction and `set local` settings
    return url.toString();
  }
  throw new Error('No database: set DATABASE_URL, or run `supabase link` and set SUPABASE_DB_PASSWORD.');
}

export async function connect(root: string, actor: string): Promise<pg.Client> {
  const url = databaseUrl(root);
  const host = new URL(url).hostname;
  const isSupabase = /\.supabase\.(co|com)$/.test(host);
  const client = new pg.Client({
    connectionString: url,
    ssl: isSupabase ? { ca: readFileSync(join(root, 'supabase/prod-ca-2021.crt'), 'utf8') } : undefined,
    application_name: `koko-${actor}`,
  });
  await client.connect();
  return client;
}

/** Runs fn inside one transaction named after the job, so the audit log shows who changed what. */
export async function inTransaction<T>(client: pg.Client, actor: string, fn: () => Promise<T>, commit: boolean): Promise<T> {
  await client.query('begin');
  try {
    await client.query(`select set_config('koko.actor', $1, true)`, [actor]);
    const result = await fn();
    await client.query(commit ? 'commit' : 'rollback');
    return result;
  } catch (e) {
    await client.query('rollback');
    throw e;
  }
}
