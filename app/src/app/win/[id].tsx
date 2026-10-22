// Lesson complete: stars (from the mistakes), the words Koko learned, and DHM's message for parents.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { wordAudio } from '../../../../packages/shared/src/audio.ts';
import type { Lesson } from '../../../../packages/shared/src/schema.ts';
import { playSeq } from '../../audio/sound';
import { useParentalGate } from '../../components/ParentalGate';
import { PromoCards } from '../../components/Promos';
import { Ar, Btn, Card, IMG, Screen, Stars, T } from '../../components/ui';
import { getLesson } from '../../data/content';
import { starsFor } from '../../logic/progress';
import { session, useProgress } from '../../state/progress';
import { C } from '../../theme';

export default function Win() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { progress, update } = useProgress();
  const [L, setL] = useState<Lesson | null>(null);
  const [stars] = useState(() => starsFor(session.id === id ? session.mistakes : 0));
  const { open, gate } = useParentalGate();
  useEffect(() => {
    getLesson(id).then(setL);
    update(p => ({ ...p, stars: { ...p.stars, [id]: Math.max(p.stars[id] ?? 0, stars) }, step: { ...p.step, [id]: 0 } }));
    session.id = ''; session.mistakes = 0;
  }, [id]);
  return <Screen>
    <View style={{ alignItems: 'center', gap: 8, marginTop: 10 }}>
      <T size={14} color={C.white}>LESSON COMPLETE</T>
      <Image source={IMG.cheer} style={{ width: 160, height: 160 }} resizeMode="contain" />
      <Ar size={34} color={C.white}>أَحْسَنْتَ!</Ar>
      <T size={20} color={C.white} center>Well done, {progress.name || 'friend'}! Koko learned it from you.</T>
      <Stars n={stars} size={44} />
    </View>
    {L?.words?.length ? <Card><T size={13} color={C.muted}>WORDS YOU TAUGHT KOKO</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{L.words.slice(0, 12).map(w => <Pressable key={w.id} accessibilityRole="button" accessibilityLabel={w.en}
        onPress={() => playSeq([wordAudio(L.id, w), { en: w.en }])} style={{ backgroundColor: '#F3F6FF', borderRadius: 14, padding: 6, alignItems: 'center' }}>
        <Ar size={18}>{w.ar}</Ar><T size={12} color={C.muted}>{w.en}</T></Pressable>)}</View></Card> : null}
    <Btn label="Show Mum and Dad" onPress={() => router.replace('/parents')} />
    {stars < 3 ? <Btn label="Try again for 3 stars" kind="ghost" onPress={() => router.replace(`/lesson/${id}/0`)} /> : null}
    <Btn label="Back to the map" kind="ghost" onPress={() => router.replace('/')} />
    <PromoCards placement="after_lesson" open={open} />
    {gate}
  </Screen>;
}
