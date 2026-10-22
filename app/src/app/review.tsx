// Quick review of the words Koko "forgot", across lessons (app.js review()).
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import type { Lesson } from '../../../packages/shared/src/schema.ts';
import { sfx } from '../audio/sound';
import { confetti } from '../components/Confetti';
import { Screen, T } from '../components/ui';
import { getLesson } from '../data/content';
import { markWord, reviewList } from '../logic/progress';
import { Listen, type Pool } from '../steps/games';
import { useProgress } from '../state/progress';
import { C } from '../theme';

export default function Review() {
  const { progress, update } = useProgress();
  const [pool, setPool] = useState<Pool | null>(null), [first, setFirst] = useState<Lesson | null>(null);
  useEffect(() => {
    (async () => {
      const base: Pool = [];
      for (const k of reviewList(progress)) {
        const [lid, wid] = k.split('|');
        const L = await getLesson(lid!).catch(() => null);
        const w = L?.words?.find(x => x.id === wid);
        if (L && w) base.push({ L, w });
      }
      if (!base.length) { router.replace('/'); return; }
      const extra: Pool = [];
      for (const p of base) for (const w of p.L.words ?? []) if (!base.some(x => x.w === w) && !extra.some(x => x.w === w)) extra.push({ L: p.L, w });
      setFirst(base[0]!.L);
      setPool([...base, ...extra].slice(0, Math.max(base.length + 3, 4)));
    })();
  }, []);
  if (!pool || !first) return <Screen><T color={C.white} center>Loading…</T></Screen>;
  return <Screen>
    <T size={22} color={C.white}>Quick review</T>
    <Listen L={first} pool={pool} firstTime finish={() => { confetti(); sfx.win(); router.replace('/'); }} mistake={() => sfx.wrong()}
      markWord={(w, ok) => update(p => markWord(p, first.id, w, ok))} />
  </Screen>;
}
