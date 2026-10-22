// Every link that leaves the app (DHM booking, courses, the privacy policy) opens only after a grown-up answers
// a question a young child cannot (Google Play Families policy, Apple Kids category).
import { useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { gateAccepts, gateQuestion, type GateQuestion } from '../logic/gate';
import { C, F } from '../theme';
import { Btn, T } from './ui';

export function useParentalGate() {
  const [pending, setPending] = useState<{ url: string; q: GateQuestion } | null>(null);
  const [typed, setTyped] = useState(''), [wrong, setWrong] = useState(false);
  const open = (url: string) => { setTyped(''); setWrong(false); setPending({ url, q: gateQuestion() }); };
  const close = () => setPending(null);
  const submit = () => {
    if (!pending) return;
    if (gateAccepts(pending.q, typed)) { const url = pending.url; close(); void Linking.openURL(url); }
    else { setWrong(true); setTyped(''); setPending({ url: pending.url, q: gateQuestion() }); }
  };
  const gate = <Modal visible={Boolean(pending)} transparent animationType="fade" onRequestClose={close}>
    <View style={st.backdrop}>
      <View style={st.box} accessibilityViewIsModal>
        <T size={22} weight="heavy">For grown-ups</T>
        <T size={16} weight="medium" color={C.muted}>This link opens a website outside the app. Please ask a parent.</T>
        <T size={20}>{pending?.q.text}</T>
        <TextInput value={typed} onChangeText={setTyped} keyboardType="number-pad" maxLength={3} style={st.input}
          accessibilityLabel="Answer" autoFocus onSubmitEditing={submit} />
        {wrong ? <T size={15} color={C.red}>Not quite. Here is a new question.</T> : null}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Btn label="Cancel" kind="soft" onPress={close} style={{ flex: 1 }} />
          <Btn label="Continue" kind="blue" onPress={submit} style={{ flex: 1 }} disabled={!typed} />
        </View>
      </View>
    </View>
  </Modal>;
  return { open, gate };
}

/** A link for parents, behind the gate. */
export function GatedLink({ url, children, open }: { url: string; children: React.ReactNode; open: (url: string) => void }) {
  return <Pressable accessibilityRole="link" onPress={() => open(url)}>{children}</Pressable>;
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.55)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  box: { backgroundColor: C.white, borderRadius: 22, padding: 20, gap: 12, width: '100%', maxWidth: 420 },
  input: { borderWidth: 2, borderColor: C.line, borderRadius: 14, padding: 12, fontSize: 22, fontFamily: F.en, textAlign: 'center' },
});
