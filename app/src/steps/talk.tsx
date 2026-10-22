// Talk with Koko: Koko plays one speaker, the child the other. After the right answer the child may record their
// voice and hear it back. The recording stays in the app's cache and is never uploaded.
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { lessonAudio } from '../../../packages/shared/src/audio.ts';
import { playSeq, stopAll } from '../audio/sound';
import { Ar, Btn, T } from '../components/ui';
import { shuffle } from '../logic/shuffle';
import { useProgress } from '../state/progress';
import { C } from '../theme';
import type { StepProps } from './types';

export function Talk({ L, finish, mistake }: StepProps) {
  const { progress } = useProgress();
  const D = useMemo(() => Object.fromEntries(L.dialogue!.map(d => [d.id, d])), []);
  const isKoko = (who: string) => L.speakers?.[who]?.playedBy === 'koko';
  const [t, setT] = useState(0), [answered, setAnswered] = useState(false), [wrong, setWrong] = useState<string[]>([]);
  const [log, setLog] = useState<{ id: string; me: boolean }[]>([]);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false), [mine, setMine] = useState<string | null>(null), [micOff, setMicOff] = useState(false);
  const ex = L.talk![t]!;
  const say = (id: string) => playSeq([lessonAudio(L.id, `d-${id}-ar`), { en: D[id]!.en }]);
  const choices = useMemo(() => shuffle([ex.answer, ...ex.wrong]), [t]);
  useEffect(() => { setLog(l => [...l, { id: ex.ask, me: false }]); setAnswered(false); setWrong([]); setMine(null); void say(ex.ask); }, [t]);

  async function record() {
    if (recording) { await stopRecording(); return; }
    try {
      stopAll();
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) { setMicOff(true); return; }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
      setTimeout(() => { void stopRecording(); }, 8000);
    } catch { setMicOff(true); }
  }
  async function stopRecording() {
    try { await recorder.stop(); } catch { /* already stopped */ }
    setRecording(false);
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    if (recorder.uri) { setMine(recorder.uri); void playSeq([{ uri: recorder.uri }]); }
  }

  return <View style={{ gap: 10 }}>
    {log.map((m, i) => { const d = D[m.id]!; return <View key={i} style={[st.msg, m.me && st.me]}>
      <T size={12} color={C.muted}>{isKoko(d.who) ? 'Koko' : `You (Teacher ${progress.name || 'friend'})`}</T>
      <Ar size={22} style={{ textAlign: m.me ? 'right' : 'left' }}>{d.ar}</Ar><T size={14} weight="medium">{d.en}</T>
      <Pressable accessibilityRole="button" accessibilityLabel="Hear this line" onPress={() => say(d.id)}><T size={13} color={C.blue}>🔊 hear</T></Pressable>
    </View>; })}
    <View style={st.tray}>
      {!answered ? <>
        <T color={C.muted}>Pick the best answer for Koko:</T>
        {choices.map(id => <Pressable key={id} accessibilityRole="button" accessibilityLabel={D[id]!.en} onPress={() => {
          if (id === ex.answer) { setLog(l => [...l, { id, me: true }]); setAnswered(true); void say(id); }
          else { mistake(); setWrong([...wrong, id]); }
        }} style={[st.choice, wrong.includes(id) && { backgroundColor: C.redSoft }]}><Ar size={20}>{D[id]!.ar}</Ar><T size={13} color={C.muted}>{D[id]!.en}</T></Pressable>)}
      </> : <>
        <T color={C.muted}>Now say it out loud — be the teacher!</T>
        {micOff ? <T size={14}>Microphone not available — just say it out loud!</T> : <View style={{ flexDirection: 'row', gap: 10 }}>
          <Btn label={recording ? '■ Stop' : mine ? '🎙 Record again' : '🎙 Record'} kind="blue" onPress={record} style={{ flex: 1 }} />
          {mine ? <Btn label="🔊 My voice" kind="soft" onPress={() => playSeq([{ uri: mine }])} style={{ flex: 1 }} /> : null}
        </View>}
        <Btn label={t + 1 < L.talk!.length ? 'Next question' : 'Finish'} onPress={async () => { if (recording) await stopRecording(); if (t + 1 < L.talk!.length) setT(t + 1); else finish(); }} />
      </>}
    </View>
  </View>;
}

const st = StyleSheet.create({
  msg: { backgroundColor: C.white, borderRadius: 18, padding: 10, maxWidth: '88%', alignSelf: 'flex-start', gap: 2 },
  me: { alignSelf: 'flex-end', backgroundColor: '#FFF4CC' },
  tray: { backgroundColor: C.white, borderRadius: 22, padding: 12, gap: 8 },
  choice: { borderWidth: 2, borderColor: C.line, borderRadius: 16, padding: 8, alignItems: 'center' },
});
