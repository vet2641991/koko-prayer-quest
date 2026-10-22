// Web build: a take is an in-memory blob URL; it is released when replaced or when the lesson screen closes.
const live = new Set<string>();
export function remember(uri: string) { live.add(uri); }
export function forget(uri?: string) {
  for (const u of uri ? [uri] : [...live]) { if (u.startsWith('blob:')) URL.revokeObjectURL(u); live.delete(u); }
}
export async function sweepRecordings() { /* nothing outlives the page on the web */ }
