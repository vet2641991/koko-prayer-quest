// Koko Premium decisions, kept pure so they are unit-tested (tests/app-logic.test.ts).

export type Grant = { premium: boolean; until: string | null };   // until null + premium = no end date
export type Cached = Grant & { checkedAt: number };

const live = (g: Grant | null | undefined, now: number) =>
  Boolean(g?.premium) && (g!.until === null || Date.parse(g!.until) > now);

/** Premium if the store or the parent's account says so; offline, the last answer counts until it expires. */
export function combine(store: Grant | null, account: Grant | null, cached: Cached | null, now = Date.now()): Grant {
  const sources = [store, account].filter((g): g is Grant => Boolean(g));
  const active = sources.filter(g => live(g, now));
  if (active.length) {
    const noEnd = active.some(g => g.until === null);
    return { premium: true, until: noEnd ? null : active.map(g => g.until!).sort().at(-1)! };
  }
  // nothing answered at all (offline, first moments of launch): trust the cache until its end date
  if (!store && !account && live(cached, now)) return { premium: true, until: cached!.until };
  return { premium: false, until: null };
}

/** A unit is locked only when subscriptions are switched on in this build and the family has no Premium. */
export const isLocked = (unit: { premium?: boolean }, configured: boolean, premium: boolean) =>
  unit.premium === true && configured && !premium;
