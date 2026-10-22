// First visit: the child's name, saved on this device only.
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, TextInput } from 'react-native';
import { useParentalGate } from '../components/ParentalGate';
import { Ar, Btn, Card, IMG, Screen, T } from '../components/ui';
import { PRIVACY_URL } from '../config';
import { useProgress } from '../state/progress';
import { C, F } from '../theme';

export default function Welcome() {
  const { progress, update } = useProgress();
  const [name, setName] = useState(progress.name ?? '');
  const { open, gate } = useParentalGate();
  const start = () => { const v = name.trim(); if (!v) return; update(p => ({ ...p, name: v })); router.replace('/'); };
  return <Screen>
    <Card style={{ alignItems: 'center', marginTop: 40 }}>
      <Image source={IMG.wave} style={{ width: 130, height: 130 }} resizeMode="contain" />
      <T size={26} weight="heavy" center>Hi! I'm Koko.</T>
      <T weight="medium" center>I want to learn Arabic and how to pray. Will you be my teacher?</T>
      <Ar size={26}>هَلْ تُعَلِّمُنِي؟</Ar>
      <T>What's your name, Teacher?</T>
      <TextInput value={name} onChangeText={setName} maxLength={24} autoCorrect={false} onSubmitEditing={start} accessibilityLabel="Your name"
        style={{ alignSelf: 'stretch', borderWidth: 2, borderColor: C.line, borderRadius: 14, padding: 12, fontSize: 20, fontFamily: F.en, textAlign: 'center' }} />
      <Btn label="Start teaching Koko" onPress={start} disabled={!name.trim()} style={{ alignSelf: 'stretch' }} />
      <T size={12} weight="medium" color={C.muted} center>By DHM Institute · no account, no ads · your name stays on this device</T>
      <Btn label="Privacy (for parents)" kind="soft" onPress={() => open(PRIVACY_URL)} />
    </Card>
    {gate}
  </Screen>;
}
