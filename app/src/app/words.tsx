import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { wordAudio } from '../../../packages/shared/src/audio.ts';
import type { Lesson, Word } from '../../../packages/shared/src/schema.ts';
import { playSeq } from '../audio/sound';
import { Nav } from '../components/Nav';
import { Ar, Screen, T } from '../components/ui';
import { getLesson } from '../data/content';
import { useProgress } from '../state/progress';
import { C } from '../theme';

export default function MyWords() {
  const { progress } = useProgress();
  const [items, setItems] = useState<{ L: Lesson; w: Word }[]>([]);
  useEffect(() => {
    (async () => {
      const out: { L: Lesson; w: Word }[] = [];
      for (const k of Object.keys(progress.words)) {
        const [lid, wid] = k.split('|');
        const L = await getLesson(lid!).catch(() => null);
        const w = L?.words?.find(x => x.id === wid);
        if (L && w) out.push({ L, w });
      }
      setItems(out);
    })();
  }, [progress.words]);
  return <Screen footer={<Nav />}>
    <T size={24} color={C.white}>My words</T>
    <T size={14} weight="medium" color={C.white}>{items.length} words · tap to hear Arabic, then English</T>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {items.length ? items.map(({ L, w }) => <Pressable key={`${L.id}|${w.id}`} accessibilityRole="button" accessibilityLabel={w.en}
        onPress={() => playSeq([wordAudio(L.id, w), { en: w.en }])} style={{ backgroundColor: C.white, borderRadius: 14, padding: 8, alignItems: 'center' }}>
        <Ar size={20}>{w.ar}</Ar><T size={12} color={C.muted}>{w.en}</T></Pressable>)
        : <T color={C.white}>Words you learn will collect here.</T>}
    </View>
  </Screen>;
}
