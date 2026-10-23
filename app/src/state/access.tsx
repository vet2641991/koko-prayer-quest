// Koko Premium for the whole app: is it switched on in this build, does this family have it, and the parent's
// account (optional). Refreshed at launch, when the app comes back to the front, and after sign-in, purchase or restore.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import { identify, storeBillingAvailable, storePremium } from '../account/billing';
import { accountsConfigured, fetchAccess, loadSession, onSession, type Session } from '../account/session';
import { combine, isLocked as lockedFor, type Cached, type Grant } from '../logic/access';

type Ctx = Grant & {
  configured: boolean;        // subscriptions are switched on in this build
  sources: string[];          // where Premium comes from (stripe, revenuecat…), when the parent is signed in
  parent: Session | null;
  refresh: () => Promise<void>;
  isLocked: (unit: { premium?: boolean }) => boolean;
};
const AccessCtx = createContext<Ctx | null>(null);
const CACHE = 'koko-access';
const configured = Platform.OS === 'web' ? accountsConfigured() : storeBillingAvailable();

export function AccessProvider({ children }: { children: ReactNode }) {
  const [grant, setGrant] = useState<Grant>({ premium: false, until: null });
  const [sources, setSources] = useState<string[]>([]);
  const [parent, setParent] = useState<Session | null>(null);

  const refresh = useCallback(async () => {
    if (!configured) return;
    const s = await loadSession();
    setParent(s);
    const cached = await AsyncStorage.getItem(CACHE).then(r => (r ? JSON.parse(r) as Cached : null)).catch(() => null);
    const store = storeBillingAvailable() ? await storePremium() : null;
    const acc = s ? await fetchAccess().catch(() => null) : null;
    const g = combine(store, acc ? { premium: acc.premium, until: acc.until } : null, cached);
    setGrant(g);
    setSources(acc?.sources ?? []);
    await AsyncStorage.setItem(CACHE, JSON.stringify({ ...g, checkedAt: Date.now() })).catch(() => {});
  }, []);

  useEffect(() => {
    if (!configured) return;
    void (async () => { const s = await loadSession(); await identify(s?.userId ?? null); await refresh(); })();
    const off = onSession(s => {
      setParent(s);
      // signed out or account deleted: forget the remembered answer, so this device does not keep Premium
      const forget = s ? Promise.resolve() : AsyncStorage.removeItem(CACHE).catch(() => {});
      void forget.then(() => identify(s?.userId ?? null)).then(refresh);
    });
    const sub = AppState.addEventListener('change', st => { if (st === 'active') void refresh(); });
    return () => { off(); sub.remove(); };
  }, [refresh]);

  const isLocked = useCallback((u: { premium?: boolean }) => lockedFor(u, configured, grant.premium), [grant.premium]);
  return <AccessCtx.Provider value={{ ...grant, configured, sources, parent, refresh, isLocked }}>{children}</AccessCtx.Provider>;
}

export function useAccess(): Ctx {
  const v = useContext(AccessCtx);
  if (!v) throw new Error('useAccess outside AccessProvider');
  return v;
}
