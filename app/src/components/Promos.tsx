// DHM Institute messages for parents (content/promos.json, edited in the admin dashboard). Without any promo,
// the booking card the PWA shows today. Every tap goes through the parental gate.
import { useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { BOOKING_URL } from '../config';
import { getPromos, type Promo } from '../data/content';
import { C } from '../theme';
import { IMG, T, s } from './ui';

export function PromoCards({ placement, open }: { placement: Promo['placement']; open: (url: string) => void }) {
  const [promos, setPromos] = useState<Promo[] | null>(null);
  useEffect(() => { getPromos().then(setPromos); }, []);
  if (promos === null) return null;
  const mine = promos.filter(p => p.placement === placement).sort((a, b) => a.sort - b.sort);
  const list = mine.length ? mine : placement === 'after_lesson' ? []
    : [{ id: 'booking', text: 'Book a free trial class: one-to-one online classes with certified teachers', url: BOOKING_URL, placement, sort: 0 }];
  return <>{list.map(p => <Pressable key={p.id} accessibilityRole="link" accessibilityHint="Asks a grown-up first" onPress={() => open(p.url)}
    style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
    <Image source={IMG.logo} style={{ width: 54, height: 54 }} resizeMode="contain" />
    <View style={{ flex: 1 }}>
      <T size={13} color={C.muted}>FOR PARENTS · DHM INSTITUTE</T>
      <T size={17}>{p.text}</T>
    </View>
  </Pressable>)}</>;
}
