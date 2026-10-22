// The child's voice recordings (Talk with Koko). The privacy policy promises they are never kept: each file is
// deleted when a new take replaces it and when the lesson screen closes. Files left behind by an app that was closed
// mid-lesson are swept on the next start. Nothing is ever uploaded.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File } from 'expo-file-system';

const KEY = 'koko-recordings';
const live = new Set<string>();

function remove(uri: string) {
  try { const f = new File(uri); if (f.exists) f.delete(); } catch { /* already gone */ }
}
async function save() { try { await AsyncStorage.setItem(KEY, JSON.stringify([...live])); } catch { /* best effort */ } }

/** Call as soon as a take is recorded, so it can be deleted even if the app is closed. */
export function remember(uri: string) { live.add(uri); void save(); }

/** Deletes one take, or every take when called without one. */
export function forget(uri?: string) {
  for (const u of uri ? [uri] : [...live]) { remove(u); live.delete(u); }
  void save();
}

/** On app start: deletes takes left behind last time. */
export async function sweepRecordings() {
  try { for (const u of JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]') as string[]) remove(u); } catch { /* ignore */ }
  live.clear(); await save();
}
