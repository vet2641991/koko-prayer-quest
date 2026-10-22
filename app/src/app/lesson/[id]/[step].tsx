// Runs one step of a lesson, then moves on (or to the reward screen). Counts learning time like the PWA.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import { stepsFor } from '../../../../../packages/shared/src/audio.ts';
import type { Lesson } from '../../../../../packages/shared/src/schema.ts';
import { sfx, stopAll } from '../../../audio/sound';
import { Bar, Btn, Screen, T } from '../../../components/ui';
import { getLesson } from '../../../data/content';
import { markWord, tick } from '../../../logic/progress';
import { STEPS } from '../../../steps';
import { STEP_TITLES } from '../../../steps/types';
import { session, startSession, useProgress } from '../../../state/progress';
import { C } from '../../../theme';

export default function StepScreen() {
  const { id, step } = useLocalSearchParams<{ id: string; step: string }>();
  const { progress, update } = useProgress();
  const [L, setL] = useState<Lesson | null>(null);
  useEffect(() => { getLesson(id).then(setL).catch(() => router.replace('/')); }, [id]);
  useEffect(() => () => stopAll(), [id, step]);
  useEffect(() => {   // learning time per day and the streak, every 15 s while the app is open
    const t = setInterval(() => { if (AppState.currentState === 'active') update(p => tick(p, 15)); }, 15000);
    return () => clearInterval(t);
  }, []);
  if (!L) return <Screen><T color={C.white} center>Loading…</T></Screen>;
  const steps = stepsFor(L);
  const i = Math.max(0, Math.min(Number(step) || 0, steps.length - 1));
  const k = steps[i]!;
  startSession(id);
  const Step = STEPS[k]!;
  const [title, sub] = STEP_TITLES[k]!;
  const finish = () => {
    stopAll();
    update(p => ({ ...p, last: id, step: { ...p.step, [id]: Math.max(p.step[id] ?? 0, i + 1) } }));
    if (i + 1 < steps.length) router.replace(`/lesson/${id}/${i + 1}`); else router.replace(`/win/${id}`);
  };
  return <Screen>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Btn label="‹" kind="ghost" onPress={() => { stopAll(); router.navigate(`/lesson/${id}`); }} accessibilityLabel="Back to the lesson" style={{ minHeight: 44, paddingVertical: 4 }} />
      <View style={{ flex: 1 }}><T size={18} color={C.white}>{title}</T><T size={13} weight="medium" color="rgba(255,255,255,.85)">{k === 'order' ? L.order?.en : sub || L.title.en}</T></View>
      <View style={{ backgroundColor: C.yellow, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 }}><T size={14}>{i + 1} / {steps.length}</T></View>
    </View>
    <Bar pct={((i + 0.5) / steps.length) * 100} onBlue />
    <Step key={`${id}-${i}`} L={L} finish={finish} firstTime={(progress.step[id] ?? 0) <= i}
      mistake={() => { session.mistakes++; sfx.wrong(); }}
      markWord={(w, ok) => update(p => markWord(p, L.id, w, ok))} />
  </Screen>;
}
