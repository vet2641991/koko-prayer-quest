// The map: "continue" card, review, the units of a world as a path, the worlds, and DHM's card for parents.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { stepsFor } from '../../../packages/shared/src/audio.ts';
import type { Lesson } from '../../../packages/shared/src/schema.ts';
import { getCatalog, getLesson, type Catalog, type Unit, type World } from '../data/content';
import { nextUnit, reviewList, totalStars } from '../logic/progress';
import { useAccess } from '../state/access';
import { useProgress } from '../state/progress';
import { C } from '../theme';
import { Nav } from './Nav';
import { useParentalGate } from './ParentalGate';
import { PromoCards } from './Promos';
import { Ar, Bar, Btn, Card, IMG, Screen, T } from './ui';

export function Home({ worldId }: { worldId?: string }) {
  const { progress, ready } = useProgress();
  const [cat, setCat] = useState<Catalog | null>(null);
  const [error, setError] = useState('');
  const [cont, setCont] = useState<{ world: World; unit: Unit; lesson: Lesson } | null>(null);
  const { open, gate } = useParentalGate();
  const access = useAccess();
  const toPremium = () => open(() => router.push('/premium'));
  useEffect(() => { getCatalog().then(setCat).catch(e => setError(String(e.message ?? e))); }, []);
  const next = cat ? nextUnit(cat, progress) : null;
  useEffect(() => {
    if (!next) { setCont(null); return; }
    getLesson(next.unit.id).then(L => L && setCont({ world: next.world as World, unit: next.unit as Unit, lesson: L })).catch(() => {});
  }, [cat, next?.unit.id]);
  useEffect(() => { if (ready && !progress.name) router.replace('/welcome'); }, [ready, progress.name]);

  if (error) return <Screen><Card><T size={22}>Oops, Koko tripped.</T><T weight="medium">{error}</T>
    <Btn label="Try again" onPress={() => { setError(''); getCatalog(true).then(setCat).catch(e => setError(String(e.message ?? e))); }} /></Card></Screen>;
  if (!cat) return <Screen><T color={C.white} center>Loading Koko…</T></Screen>;
  const world = cat.worlds.find(w => w.id === (worldId ?? cont?.world.id ?? next?.world.id ?? cat.focusNew ?? cat.focus)) ?? cat.worlds[0]!;
  const rv = reviewList(progress);
  const steps = cont ? stepsFor(cont.lesson) : [];
  const at = cont ? Math.min(progress.step[cont.unit.id] ?? 0, steps.length) : 0;

  return <Screen footer={<Nav />}>
    <View style={st.top}>
      <Image source={IMG.wave} style={st.avatar} />
      <View style={{ flex: 1 }}><T size={20} color={C.white}>Hi, Teacher {progress.name || 'friend'}!</T>
        <T size={14} weight="medium" color="rgba(255,255,255,.85)">Koko is ready to learn from you</T></View>
      <View style={st.pill}><T size={16}>★ {totalStars(progress)}</T></View>
    </View>
    {cont ? <Card>
      <T size={13} color={C.muted}>CONTINUE · {cont.world.en.toUpperCase()} · {cont.world.id.startsWith('ar') ? 'UNIT' : 'LEVEL'} {cont.unit.n}</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}><Ar size={24} style={{ textAlign: 'left' }}>{cont.lesson.title.ar}</Ar><T size={22}>{cont.lesson.title.en}</T>
          {cont.lesson.topic ? <T size={14} weight="medium" color={C.muted}>{cont.lesson.topic}</T> : null}</View>
        <Image source={IMG.cheer} style={{ width: 84, height: 84 }} />
      </View>
      <T size={14} color={C.muted}>Step {Math.min(at + 1, steps.length)} of {steps.length} · about {cont.lesson.minutes ?? 10} min</T>
      <Bar pct={steps.length ? (at / steps.length) * 100 : 0} />
      {access.isLocked(cont.unit) ? <Btn label="🔒 Koko Premium · ask a grown-up" kind="blue" onPress={toPremium} />
        : <Btn label={`${at ? 'Continue' : 'Play'}: teach Koko`} onPress={() => router.push(`/lesson/${cont.unit.id}`)} />}
    </Card> : <Card><T size={20}>You finished every lesson that is ready!</T><T weight="medium" color={C.muted}>New lessons are on the way. Replay any lesson to win more stars.</T></Card>}
    {rv.length ? <Pressable onPress={() => router.push('/review')}><Card><T size={13} color={C.muted}>QUICK REVIEW · 2 MIN</T>
      <T size={19}>Koko forgot {rv.length} word{rv.length > 1 ? 's' : ''}. Help him remember!</T></Card></Pressable> : null}

    <View style={{ marginTop: 6 }}><T size={20} color={C.white}>{world.code ? `${world.code} · ` : ''}{world.en}</T><Ar size={20} color={C.white} style={{ textAlign: 'left' }}>{world.ar}</Ar></View>
    <View style={{ gap: 10 }}>
      {world.units.length ? world.units.map(u => <UnitNode key={u.id} unit={u} current={next?.unit.id === u.id} locked={access.isLocked(u)} onLocked={toPremium} />)
        : <T color={C.white}>Lessons for this world are coming soon.</T>}
    </View>
    <PromoCards placement="map" open={open} />
    <T size={13} color="rgba(255,255,255,.8)" center>By DHM Institute</T>
    {gate}
  </Screen>;
}

function UnitNode({ unit, current, locked, onLocked }: { unit: Unit; current: boolean; locked: boolean; onLocked: () => void }) {
  const { progress } = useProgress();
  const st_ = progress.stars[unit.id] ?? 0;
  const playable = Boolean(unit.file);
  const tag = unit.go ? 'go' : !playable ? 'soon' : locked ? '🔒' : current ? 'NOW' : st_ ? '★'.repeat(st_) : 'play';
  const onPress = unit.go ? () => router.push(`/world/${unit.go}`) : !playable ? undefined : locked ? onLocked : () => router.push(`/lesson/${unit.id}`);
  return <Pressable disabled={!onPress} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${unit.en}, ${locked && playable ? 'Koko Premium' : tag}`}
    style={[st.node, current && { borderColor: C.yellow, borderWidth: 3 }, !playable && !unit.go && { opacity: 0.55 }]}>
    <View style={[st.dot, current && { backgroundColor: C.yellow }]}><T size={16} color={current ? C.ink : C.white}>{unit.n}</T></View>
    <View style={{ flex: 1 }}><Ar size={18} style={{ textAlign: 'left' }}>{unit.ar}</Ar><T size={14} weight="medium" color={C.muted}>{unit.en}</T></View>
    <T size={13} color={current ? C.blue : C.muted}>{tag}</T>
  </Pressable>;
}

const st = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 52, height: 52, borderRadius: 26, borderWidth: 3, borderColor: C.yellow, backgroundColor: C.white },
  pill: { backgroundColor: C.yellow, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  node: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.white, borderRadius: 18, padding: 10, borderWidth: 0, borderColor: 'transparent' },
  dot: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.blueMid, alignItems: 'center', justifyContent: 'center' },
});
