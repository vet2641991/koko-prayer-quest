// Every link that leaves the app (DHM booking, courses, the privacy policy), and every screen for parents that can
// spend money (Koko Premium, the parent account), opens only after a grown-up answers a question a young child
// cannot (Google Play Families policy, Apple Kids category).
import { useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { gateAccepts, gateQuestion, type GateQuestion } from '../logic/gate';
import { C, F } from '../theme';
import { Btn, T } from './ui';

type Target = string | (() => void);   // a website to open, or a parents' screen to show
let passedAt = 0;
/** True for a few minutes after a grown-up answered the gate (the parents' screens check it when they open). */
export const grownUpRecently = () => Date.now() - passedAt < 10 * 60_000;

export function useParentalGate(onCancel?: () => void) {
  const [pending, setPending] = useState<{ target: Target; q: GateQuestion } | null>(null);
  const [typed, setTyped] = useState(''), [wrong, setWrong] = useState(false);
  const open = (target: Target) => { setTyped(''); setWrong(false); setPending({ target, q: gateQuestion() }); };
  const close = () => { setPending(null); onCancel?.(); };
  const submit = () => {
    if (!pending) return;
    if (gateAccepts(pending.q, typed)) {
      const t = pending.target;
      passedAt = Date.now();
      setPending(null);
      if (typeof t === 'string') void Linking.openURL(t); else t();
    } else { setWrong(true); setTyped(''); setPending({ target: pending.target, q: gateQuestion() }); }
  };
  const forLink = typeof pending?.target === 'string';
  const gate = <Modal visible={Boolean(pending)} transparent animationType="fade" onRequestClose={close}>
    <View style={st.backdrop}>
      <View style={st.box} accessibilityViewIsModal>
        <T size={22} weight="heavy">For grown-ups</T>
        <T size={16} weight="medium" color={C.muted}>{forLink ? 'This link opens a website outside the app. Please ask a parent.'
          : 'This part is for parents. Please ask a grown-up.'}</T>
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
