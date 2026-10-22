// Writes content JSON exactly the way the files are written today, so an export of unchanged content is a zero diff:
//   * JSON.stringify(doc, null, 2): UTF-8, Arabic and tashkeel unescaped, no trailing newline (AUDIT §10);
//   * every object keeps the key order of the file already on disk; keys that are new go in a fixed order;
//   * a file whose parsed content did not change is returned byte for byte, even if it was hand-formatted.
// The database (jsonb) does not keep key order, which is why the order has to come from the existing file.

type J = unknown;
const isObj = (v: J): v is Record<string, J> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Deep equality with object key order ignored and array order respected (the same rule as Postgres jsonb `=`). */
export function sameJson(a: J, b: J): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => sameJson(x, b[i]));
  }
  if (isObj(a) || isObj(b)) {
    if (!isObj(a) || !isObj(b)) return false;
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every(k => Object.hasOwn(b, k) && sameJson(a[k], b[k]));
  }
  return a === b;
}

// Order for keys that the existing file does not have (or for a brand-new file). Paths use "[]" for array items
// and "*" for the entries of a map (speakers). Taken from the most common order in today's files.
const CANONICAL: Record<string, readonly string[]> = {
  '': ['version', 'note', 'focus', 'worlds', 'start', 'focusNew', 'teacherNote',            // catalog
       'id', 'world', 'unit', 'source', 'title', 'topic', 'minutes', 'video', 'learn', 'words', 'sounds',
       'dialogue', 'speakers', 'talk', 'games', 'order', 'quiz', 'move', 'think', 'parents', 'note'],
  'worlds[]': ['id', 'code', 'en', 'ar', 'tint', 'ink', 'units'],
  'worlds[].units[]': ['id', 'n', 'ar', 'en', 'file', 'go'],
  'title': ['ar', 'en'],
  'video': ['src', 'poster'],
  'learn[]': ['en', 'title', 'ar', 'tr', 'aud', 'koko'],
  'words[]': ['id', 'from', 'ar', 'en', 'tr', 'badge', 'sacred'],
  'sounds': ['sub', 'prompt', 'letters', 'pairs'],
  'sounds.letters[]': ['ch', 'name', 'tip'],
  'order': ['en', 'ids', 'items'],
  'order.items[]': ['id', 'ar', 'en', 'from'],
  'dialogue[]': ['id', 'who', 'ar', 'en'],
  'speakers.*': ['en', 'ar', 'playedBy'],
  'talk[]': ['ask', 'answer', 'wrong'],
  'quiz[]': ['ar', 'en', 'opts', 'keep'],
  'move': ['ar', 'en'],
  'think': ['q', 'a'],
  'parents': ['summary', 'try', 'tryAudio', 'tip'],
  'parents.try': ['ar', 'translit', 'en'],
  'promos[]': ['id', 'text', 'url', 'placement', 'sort'],
};

function orderKeys(keys: string[], template: Record<string, J> | undefined, path: string): string[] {
  const canon = CANONICAL[path] ?? [];
  const fromTemplate = template ? Object.keys(template).filter(k => keys.includes(k)) : [];
  const rest = keys.filter(k => !fromTemplate.includes(k))
    .sort((a, b) => rank(canon, a) - rank(canon, b));   // stable: unknown keys keep their own order, at the end
  return [...fromTemplate, ...rest];
}
const rank = (canon: readonly string[], k: string) => (canon.includes(k) ? canon.indexOf(k) : canon.length);

/** Returns `value` rebuilt with the key order of `template` (recursively), new keys in canonical order. */
export function orderLike(value: J, template: J, path = ''): J {
  if (Array.isArray(value)) {
    const t = Array.isArray(template) ? template : [];
    return value.map((item, i) => {
      // match array items by "id" when both sides have ids (a reordered or inserted item keeps its own key order)
      const byId = isObj(item) && typeof item.id === 'string'
        ? t.find(x => isObj(x) && x.id === item.id) : undefined;
      return orderLike(item, byId ?? t[i], `${path}[]`);
    });
  }
  if (!isObj(value)) return value;
  const tpl = isObj(template) ? template : undefined;
  const out: Record<string, J> = {};
  const isMap = path === 'speakers';   // keys are speaker names, values share one shape
  for (const k of orderKeys(Object.keys(value), tpl, path)) {
    const childPath = isMap ? `${path}.*` : path ? `${path}.${k}` : k;
    out[k] = orderLike(value[k], tpl?.[k], childPath);
  }
  return out;
}

/**
 * The text to write for `doc`, given the file currently on disk (or null for a new file).
 * Unchanged content returns the existing text untouched; changed content keeps the existing key order.
 */
export function formatContentFile(doc: J, existingText: string | null): string {
  let existing: J = undefined;
  if (existingText !== null) {
    try { existing = JSON.parse(existingText); } catch { existing = undefined; }
    if (existing !== undefined && sameJson(existing, doc)) return existingText;
  }
  return JSON.stringify(orderLike(doc, existing), null, 2);
}
