// What a child sees on a Koko Premium lesson without a subscription: no lesson content, a friendly note, and a
// button that only a grown-up can get past (the parental gate) to the Koko Premium screen.
import { router } from 'expo-router';
import { Image } from 'react-native';
import { useParentalGate } from './ParentalGate';
import { Btn, Card, IMG, Screen, T } from './ui';
import { C } from '../theme';

export function LockedLesson({ title }: { title?: string }) {
  const { open, gate } = useParentalGate();
  return <Screen>
    <Card style={{ alignItems: 'center' }}>
      <Image source={IMG.wave} style={{ width: 110, height: 110 }} resizeMode="contain" />
      <T size={22} center>🔒 {title ?? 'This lesson'}</T>
      <T weight="medium" color={C.muted} center>This lesson is part of Koko Premium. Ask a grown-up to open it for you!</T>
      <Btn label="For grown-ups" kind="blue" onPress={() => open(() => router.push('/premium'))} />
      <Btn label="Back to the map" kind="soft" onPress={() => router.navigate('/')} />
    </Card>
    {gate}
  </Screen>;
}
