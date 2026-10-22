// The PWA's bottom bar: Map, Worlds, My words, Parents.
import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { C } from '../theme';
import { T } from './ui';

const ITEMS = [['/', 'Map', '🗺️'], ['/worlds', 'Worlds', '🌍'], ['/words', 'My words', '📖'], ['/parents', 'Parents', '👪']] as const;

export function Nav() {
  const path = usePathname();
  return <View style={st.nav} accessibilityRole="tablist">
    {ITEMS.map(([href, label, icon]) => {
      const on = href === '/' ? path === '/' || path.startsWith('/world/') : path.startsWith(href);
      return <Pressable key={href} accessibilityRole="tab" accessibilityState={{ selected: on }} style={st.item} onPress={() => router.navigate(href)}>
        <T size={20} center>{icon}</T><T size={13} center color={on ? C.blue : C.muted}>{label}</T>
      </Pressable>;
    })}
  </View>;
}
const st = StyleSheet.create({
  nav: { flexDirection: 'row', backgroundColor: C.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 6, paddingBottom: 6 },
  item: { flex: 1, alignItems: 'center', paddingVertical: 4 },
});
