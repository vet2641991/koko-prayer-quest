// Test helpers: a fresh migrated database per test file, a scratch copy of the repo, and a way to run the scripts.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';

export const repo = process.cwd();
export const adminUrl = process.env.DATABASE_URL;
export const skipDb = !adminUrl ? 'DATABASE_URL is not set' : false;

/** Creates (or recreates) database `name` next to DATABASE_URL, with the Supabase stub and every migration applied. */
export async function freshDatabase(name: string): Promise<string> {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`drop database if exists ${name} with (force)`);
  await admin.query(`create database ${name}`);
  await admin.end();
  const u = new URL(adminUrl!);
  u.pathname = `/${name}`;
  const url = u.toString();
  const files = ['supabase/tests/support/supabase_stub.sql',
    ...readdirSync(join(repo, 'supabase/migrations')).filter(f => f.endsWith('.sql')).sort().map(f => `supabase/migrations/${f}`)];
  for (const f of files) {
    const r = spawnSync('psql', [url, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '--single-transaction', '-f', join(repo, f)], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`${f}: ${r.stderr}`);
  }
  return url;
}

/** A scratch copy of the repo: content and seeds copied, audio and media linked (one audio folder copied). */
export function scratchRepo(copiedAudio: string[] = []): string {
  const dir = mkdtempSync(join(tmpdir(), 'koko-'));
  cpSync(join(repo, 'content'), join(dir, 'content'), { recursive: true });
  cpSync(join(repo, 'supabase/seed'), join(dir, 'supabase/seed'), { recursive: true });
  mkdirSync(join(dir, 'audio'));
  for (const d of readdirSync(join(repo, 'audio'))) {
    if (copiedAudio.includes(d)) cpSync(join(repo, 'audio', d), join(dir, 'audio', d), { recursive: true });
    else symlinkSync(join(repo, 'audio', d), join(dir, 'audio', d));
  }
  symlinkSync(join(repo, 'media'), join(dir, 'media'));
  return dir;
}

export function runScript(script: 'import-json' | 'export-static', cwd: string, databaseUrl: string, ...args: string[]) {
  const r = spawnSync(join(repo, 'node_modules/.bin/tsx'), [join(repo, `scripts/${script}.ts`), ...args],
    { cwd, env: { ...process.env, DATABASE_URL: databaseUrl, GITHUB_STEP_SUMMARY: '', GITHUB_OUTPUT: '' }, encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}

export const editJson = (dir: string, path: string, fn: (doc: any) => void) => {
  const doc = JSON.parse(readFileSync(join(dir, path), 'utf8')); fn(doc);
  writeFileSync(join(dir, path), JSON.stringify(doc, null, 2));
};
