import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Nav } from '../components/Nav';
import { Ar, Bar, Card, Screen, T } from '../components/ui';
import { getCatalog, type Catalog } from '../data/content';
import { useProgress } from '../state/progress';
import { C } from '../theme';

export default function Worlds() {
  const { progress } = useProgress();
  const [cat, setCat] = useState<Catalog | null>(null);
  useEffect(() => { getCatalog().then(setCat).catch(() => {}); }, []);
  return <Screen footer={<Nav />}>
    <T size={24} color={C.white}>Choose a world</T><Ar size={22} color={C.white} style={{ textAlign: 'left' }}>اخْتَرْ عَالَمًا</Ar>
    {cat?.worlds.map(w => {
      const ls = w.units.filter(u => !u.go);   // a "go" unit links to another world; it is not a lesson still to come
      const built = ls.filter(u => u.file).length, fin = ls.filter(u => (progress.stars[u.id] ?? 0) > 0).length;
      const icon = w.en.match(/\d/)?.[0] ?? '★';
      return <Pressable key={w.id} onPress={() => router.push(`/world/${w.id}`)} accessibilityRole="button">
        <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: w.tint, alignItems: 'center', justifyContent: 'center' }}>
            <T size={24} color={w.ink}>{icon}</T></View>
          <View style={{ flex: 1, gap: 2 }}>
            <T size={18}>{w.code ? `${w.code} · ` : ''}{w.en}</T><Ar size={16} style={{ textAlign: 'left' }}>{w.ar}</Ar>
            <Bar pct={ls.length ? (fin / ls.length) * 100 : 0} />
            <T size={13} weight="medium" color={C.muted}>{fin} of {ls.length} done{built < ls.length ? ` · ${ls.length - built} coming soon` : ''}</T>
          </View>
        </Card>
      </Pressable>;
    })}
    <T weight="medium" color={C.white}>New worlds and lessons appear here as soon as they are added. Nothing you finished is ever lost.</T>
  </Screen>;
}
