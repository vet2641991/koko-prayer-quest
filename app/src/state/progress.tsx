// The child's progress, saved on this device only (AsyncStorage), in the same shape as the PWA.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { STORAGE_KEY, emptyProgress, parseProgress, type Progress } from '../logic/progress';

type Ctx = { progress: Progress; ready: boolean; update: (fn: (p: Progress) => Progress) => void };
const ProgressCtx = createContext<Ctx | null>(null);

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<Progress>(emptyProgress());
  const [ready, setReady] = useState(false);
  const latest = useRef(progress);
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => { const p = parseProgress(raw); latest.current = p; setProgress(p); setReady(true); });
  }, []);
  const update = useCallback((fn: (p: Progress) => Progress) => {
    const next = fn(latest.current);
    latest.current = next;
    setProgress(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);
  return <ProgressCtx.Provider value={{ progress, ready, update }}>{children}</ProgressCtx.Provider>;
}

export function useProgress(): Ctx {
  const v = useContext(ProgressCtx);
  if (!v) throw new Error('useProgress outside ProgressProvider');
  return v;
}

/** Mistakes in the lesson being played (stars at the end); reset when another lesson starts. */
export const session = { id: '', mistakes: 0 };
export function startSession(id: string) { if (session.id !== id) { session.id = id; session.mistakes = 0; } }
