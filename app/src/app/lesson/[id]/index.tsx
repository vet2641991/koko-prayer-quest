// A lesson's path: its steps, which are done, and where to continue.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { stepsFor } from '../../../../../packages/shared/src/audio.ts';
import type { Lesson } from '../../../../../packages/shared/src/schema.ts';
import { Ar, Bar, Btn, Card, Screen, T } from '../../../components/ui';
import { getCatalog, getLesson, unitById, type World } from '../../../data/content';
import { STEP_MINUTES, STEP_TITLES } from '../../../steps/types';
import { useProgress } from '../../../state/progress';
import { C } from '../../../theme';

export default function LessonPath() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { progress, update } = useProgress();
  const [L, setL] = useState<Lesson | null>(null), [world, setWorld] = useState<World | null>(null), [n, setN] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    (async () => {
      const cat = await getCatalog(); const u = unitById(cat, id);
      if (!u) return setError('This lesson is not available.');
      setWorld(u.world); setN(u.unit.n);
      const lesson = await getLesson(id); if (!lesson) return setError('This lesson is not ready yet.');
      setL(lesson); update(p => ({ ...p, last: id }));
    })().catch(e => setError(String(e.message ?? e)));
  }, [id]);
  if (error) return <Screen><Card><T size={20}>{error}</T><Btn label="Back to the map" onPress={() => router.navigate('/')} /></Card></Screen>;
  if (!L || !world) return <Screen><T color={C.white} center>Loading…</T></Screen>;
  const steps = stepsFor(L), at = Math.min(progress.step[id] ?? 0, steps.length);
  return <Screen>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Btn label="‹" kind="ghost" onPress={() => router.navigate(`/world/${world.id}`)} accessibilityLabel="Back to the map" style={{ minHeight: 44, paddingVertical: 4 }} />
      <T color={C.white} style={{ flex: 1 }}>{world.en} · {n}</T>
      <T size={14} color={C.white}>about {L.minutes ?? 10} min</T>
    </View>
    <Ar size={30} color={C.white} style={{ textAlign: 'left' }}>{L.title.ar}</Ar>
    <T size={26} color={C.white}>{L.title.en}</T>
    <T size={14} color={C.white}>{at} of {steps.length} steps done · Koko: “Teach me!”</T>
    <Bar pct={(at / steps.length) * 100} onBlue />
    <View style={{ gap: 8 }}>
      {steps.map((k, i) => {
        const [title, sub] = STEP_TITLES[k]!;
        const open = i <= at;
        return <Pressable key={k + i} disabled={!open} onPress={() => router.push(`/lesson/${id}/${i}`)} accessibilityRole="button"
          accessibilityLabel={`Step ${i + 1}: ${title}${i < at ? ', done' : ''}`}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, opacity: open ? 1 : 0.55, borderWidth: i === at ? 3 : 0, borderColor: C.yellow }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: i < at ? C.green : i === at ? C.yellow : '#E3EAFB', alignItems: 'center', justifyContent: 'center' }}>
              <T size={16} color={i < at ? C.white : C.ink}>{i < at ? '✓' : i + 1}</T></View>
            <View style={{ flex: 1 }}><T size={17}>{title}</T><T size={13} weight="medium" color={C.muted}>{k === 'order' ? L.order?.en : k === 'move' ? L.move?.en : sub}</T></View>
            <T size={13} color={C.muted}>{STEP_MINUTES[k]} min</T>
          </Card>
        </Pressable>;
      })}
    </View>
    <Btn label={at >= steps.length ? 'Play again' : at ? 'Continue' : 'Start'} onPress={() => router.push(`/lesson/${id}/${Math.min(at, steps.length - 1)}`)} />
  </Screen>;
}
