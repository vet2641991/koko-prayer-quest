// Reads the static content tree of the repo (content/, audio/, media/) exactly as GitHub Pages serves it.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export type ContentTree = {
  root: string;
  catalogText: string;
  catalog: unknown;
  texts: Map<string, string>;     // content/<world>/<file>.json -> exact file text
  lessons: Map<string, unknown>;  // same keys -> parsed JSON
  promosText: string | null;
  promos: unknown;
  fileExists: (path: string) => boolean;
};

export function readContentTree(root: string): ContentTree {
  const catalogText = readFileSync(join(root, 'content/catalog.json'), 'utf8');
  const texts = new Map<string, string>(), lessons = new Map<string, unknown>();
  for (const dir of readdirSync(join(root, 'content'), { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    for (const f of readdirSync(join(root, 'content', dir.name)).filter(f => f.endsWith('.json')).sort()) {
      const path = `content/${dir.name}/${f}`;
      const text = readFileSync(join(root, path), 'utf8');
      texts.set(path, text);
      lessons.set(path, JSON.parse(text));
    }
  }
  const promosPath = join(root, 'content/promos.json');
  const promosText = existsSync(promosPath) ? readFileSync(promosPath, 'utf8') : null;
  return {
    root, catalogText, catalog: JSON.parse(catalogText), texts, lessons, promosText,
    promos: promosText === null ? undefined : JSON.parse(promosText),
    fileExists: p => !p.includes('..') && existsSync(join(root, p)) && statSync(join(root, p)).isFile(),
  };
}

export type MediaFile = { path: string; bytes: number; sha256: string };

/** Every file under audio/ and media/ (except audio/_rejected, which is git-ignored local review material). */
export function listMediaFiles(root: string): MediaFile[] {
  const out: MediaFile[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      const st = e.isSymbolicLink() ? statSync(join(root, rel)) : e;   // follow links (used by the import tests)
      if (st.isDirectory()) { if (rel !== 'audio/_rejected') walk(rel); continue; }
      if (!st.isFile() || e.name.startsWith('.')) continue;
      const buf = readFileSync(join(root, rel));
      out.push({ path: rel.split(sep).join('/'), bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') });
    }
  };
  for (const top of ['audio', 'media']) if (existsSync(join(root, top))) walk(top);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export const repoRelative = (root: string, abs: string) => relative(root, abs).split(sep).join('/');
