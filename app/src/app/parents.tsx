// For parents: what the child is learning, in two minutes. Links leave the app only behind the parental gate.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { lessonAudio } from '../../../packages/shared/src/audio.ts';
import type { Lesson } from '../../../packages/shared/src/schema.ts';
import { playSeq } from '../audio/sound';
import { Nav } from '../components/Nav';
import { useParentalGate } from '../components/ParentalGate';
import { PromoCards } from '../components/Promos';
import { Ar, Btn, Card, Screen, T } from '../components/ui';
import { DHM_URL, PRIVACY_URL } from '../config';
import { getCatalog, getLesson, unitById, type Catalog } from '../data/content';
import { streak, today, wordsLearned } from '../logic/progress';
import { useProgress } from '../state/progress';
import { C } from '../theme';

export default function Parents() {
  const { progress } = useProgress();
  const [cat, setCat] = useState<Catalog | null>(null), [L, setL] = useState<Lesson | null>(null);
  const { open, gate } = useParentalGate();
  useEffect(() => { getCatalog().then(setCat).catch(() => {}); if (progress.last) getLesson(progress.last).then(setL).catch(() => {}); }, [progress.last]);
  const mins = Math.round((progress.time[today()] ?? 0) / 60);
  const world = cat && progress.last ? unitById(cat, progress.last)?.world : null;
  const P = L?.parents;
  return <Screen light footer={<Nav />}>
    <T size={26}>For parents</T>
    <T weight="medium" color={C.muted}>What {progress.name || 'your child'} is learning, in two minutes.</T>
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {[[mins, 'minutes today'], [wordsLearned(progress), 'words learned'], [streak(progress), 'days in a row']].map(([v, l]) =>
        <Card key={String(l)} style={{ flex: 1, alignItems: 'center' }}><T size={26}>{v}</T><T size={12} weight="medium" color={C.muted} center>{l}</T></Card>)}
    </View>
    {L ? <Card><T size={13} color={C.muted}>LATEST · {world?.en.toUpperCase()}</T><T size={18}>{L.title.en}</T><Ar size={20} style={{ textAlign: 'left' }}>{L.title.ar}</Ar>
      <T weight="medium" color={C.muted}>{P ? P.summary : L.topic}</T></Card>
      : <Card><T>{progress.name || 'Your child'} has not started a lesson on this device yet.</T></Card>}
    {P?.try ? <Card style={{ backgroundColor: '#E6F4F3' }}><T>Try this at home (2 minutes)</T><T size={15} weight="medium">{P.tip}</T>
      <Ar size={24} style={{ textAlign: 'left' }}>{P.try.ar}</Ar><T size={14} color={C.muted}>“{P.try.translit}” · {P.try.en}</T>
      {P.tryAudio ? <Btn label="🔊 Play" kind="soft" onPress={() => playSeq([lessonAudio(L!.id, P.tryAudio!)])} /> : null}</Card> : null}
    {cat?.teacherNote?.text ? <Card><T size={13} color={C.muted}>NOTE FROM DR. HASSAN</T><T weight="medium">{cat.teacherNote.text}</T></Card> : null}
    <PromoCards placement="parents" open={open} />
    <T size={12} weight="medium" color={C.muted} center>By DHM Institute · progress is saved on this device only</T>
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Btn label="DHM Institute" kind="soft" onPress={() => open(DHM_URL)} style={{ flex: 1 }} />
      <Btn label="Privacy" kind="soft" onPress={() => open(PRIVACY_URL)} style={{ flex: 1 }} />
      <Btn label="Change name" kind="soft" onPress={() => router.push('/welcome')} style={{ flex: 1 }} />
    </View>
    {gate}
  </Screen>;
}
