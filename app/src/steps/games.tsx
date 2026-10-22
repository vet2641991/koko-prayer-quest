// Letter sounds, Listen & choose, Match, Order and Quiz: the games. Mistakes count towards the stars.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { lessonAudio, wordAudio } from '../../../packages/shared/src/audio.ts';
import type { Lesson, Word } from '../../../packages/shared/src/schema.ts';
import { playSeq, sfx } from '../audio/sound';
import { Ar, Btn, Card, KokoSays, T } from '../components/ui';
import { shuffle } from '../logic/shuffle';
import { C } from '../theme';
import type { StepProps } from './types';

function Opt({ children, onPress, state, disabled, label, grow = true }: { children: React.ReactNode; onPress: () => void; state?: 'right' | 'wrong' | 'gone' | 'picked'; disabled?: boolean; label: string; grow?: boolean }) {
  const bg = state === 'right' ? C.greenSoft : state === 'wrong' ? C.redSoft : state === 'picked' ? '#FFF4CC' : C.white;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled || state === 'gone'} onPress={onPress}
    style={[st.opt, grow && { flex: 1 }, { backgroundColor: bg, opacity: state === 'gone' ? 0.25 : 1, borderColor: state === 'picked' ? C.yellow : 'transparent' }]}>{children}</Pressable>;
}

export function Sounds({ L, finish, mistake }: StepProps) {
  const S = L.sounds!;
  const clip = (i: number, j: number) => lessonAudio(L.id, `s-${i + 1}-${j}-ar`);
  const [playing, setPlaying] = useState(false);
  const rounds = useMemo(() => shuffle(S.pairs.flatMap((p, i) => p.map((w, j) => ({ i, j, w })))).slice(0, 8), []);
  const [r, setR] = useState(0), [fb, setFb] = useState<{ ok: boolean; text: string } | null>(null);
  const t = rounds[r];
  useEffect(() => { if (playing && t) { setFb(null); void playSeq([clip(t.i, t.j)]); } }, [playing, r]);
  if (!playing) return <View style={{ gap: 12 }}>
    <View style={{ flexDirection: 'row', gap: 10 }}>{S.letters.map((x, j) => <Card key={j} style={{ flex: 1, alignItems: 'center' }}>
      <Ar size={60} color={C.blue}>{x.ch}</Ar><T>{x.name}</T><T size={13} weight="medium" color={C.muted} center>{x.tip}</T></Card>)}</View>
    <Card><T size={13} color={C.muted}>TAP A WORD TO HEAR IT</T>
      {S.pairs.map((p, i) => <View key={i} style={{ flexDirection: 'row', gap: 8 }}>{p.map((w, j) =>
        <Opt key={j} label={`Hear ${w}`} onPress={() => playSeq([clip(i, j)])}><Ar size={24}>{w}</Ar></Opt>)}</View>)}</Card>
    <Btn label="I'm ready — test my ears!" onPress={() => setPlaying(true)} />
  </View>;
  return <View style={{ gap: 12 }}>
    <Pressable accessibilityRole="button" accessibilityLabel="Play the word again" onPress={() => playSeq([clip(t!.i, t!.j)])} style={st.playBig}><T size={44} center>🔊</T></Pressable>
    <T size={18} color={C.white} center>{S.prompt ?? 'Which letter is in the word?'} · Round {r + 1} of {rounds.length}</T>
    <View style={{ flexDirection: 'row', gap: 10 }}>{S.letters.map((x, j) => <Opt key={j} label={x.name} disabled={fb?.ok} onPress={() => {
      if (j === t!.j) { sfx.right(); setFb({ ok: true, text: `Yes! ${t!.w} → ${x.name}` }); setTimeout(() => (r + 1 < rounds.length ? setR(r + 1) : finish()), 1300); }
      else { mistake(); setFb({ ok: false, text: 'Listen again, Teacher!' }); void playSeq([clip(t!.i, t!.j)]); }
    }}><Ar size={48}>{x.ch}</Ar><T size={14}>{x.name}</T></Opt>)}</View>
    {fb ? <KokoSays text={fb.text} mood="cheer" tone={fb.ok ? 'good' : 'bad'} /> : null}
  </View>;
}

export type Pool = { L: Lesson; w: Word }[];

/** Listen & choose. Also used by the cross-lesson review with a pool of forgotten words. */
export function Listen({ L, finish, mistake, markWord, pool }: StepProps & { pool?: Pool }) {
  const W = useMemo(() => pool ?? L.words!.map(w => ({ L, w })), []);
  const rounds = useMemo(() => shuffle(W).slice(0, Math.min(6, W.length)), []);
  const [r, setR] = useState(0), [fb, setFb] = useState<{ ok: boolean; text: string } | null>(null), [wrongs, setWrongs] = useState<number[]>([]);
  const missed = useRef(false);
  const tgt = rounds[r]!;
  const opts = useMemo(() => shuffle([tgt, ...shuffle(W.filter(x => x.L.id === tgt.L.id && x.w.id !== tgt.w.id)).slice(0, 3)]), [r]);
  const hear = () => playSeq([wordAudio(tgt.L.id, tgt.w)]);
  useEffect(() => { missed.current = false; setFb(null); setWrongs([]); void hear(); }, [r]);
  return <View style={{ gap: 12 }}>
    <Pressable accessibilityRole="button" accessibilityLabel="Play the word again" onPress={hear} style={st.playBig}><T size={44} center>🔊</T></Pressable>
    <T size={18} color={C.white} center>Koko says a word. Which one is it? · {r + 1}/{rounds.length}</T>
    <View style={st.grid}>{opts.map((o, j) => <View key={o.w.id} style={{ width: '48%' }}><Opt label={o.w.en} disabled={fb?.ok} state={fb?.ok && o === tgt ? 'right' : wrongs.includes(j) ? 'wrong' : undefined} onPress={() => {
      if (o === tgt) {
        sfx.right();
        markWord({ ...tgt.w, from: tgt.w.from ?? (tgt.L.id !== L?.id ? tgt.L.id : undefined) }, !missed.current);
        setFb({ ok: true, text: `Yes! “${tgt.w.en}”. You taught me!` });
        void playSeq([{ en: tgt.w.en }]);
        setTimeout(() => (r + 1 < rounds.length ? setR(r + 1) : finish()), 1400);
      } else { missed.current = true; mistake(); setWrongs([...wrongs, j]); setFb({ ok: false, text: 'Hmm, listen again!' }); void hear(); }
    }}><Ar size={24}>{o.w.ar}</Ar><T size={13} color={C.muted}>{o.w.en}</T></Opt></View>)}</View>
    {fb ? <KokoSays text={fb.text} mood="cheer" tone={fb.ok ? 'good' : 'bad'} /> : null}
  </View>;
}

export function Match({ L, finish, mistake, markWord }: StepProps) {
  const set = useMemo(() => shuffle(L.words!).slice(0, Math.min(5, L.words!.length)), []);
  const left = useMemo(() => shuffle(set), []), right = useMemo(() => shuffle(set), []);
  const [pick, setPick] = useState<string | null>(null), [gone, setGone] = useState<string[]>([]), [wrong, setWrong] = useState<string | null>(null);
  return <View style={{ gap: 12 }}>
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ flex: 1, gap: 10 }}>{left.map(w => <Opt key={w.id} grow={false} label={`Arabic: ${w.en}`} state={gone.includes(w.id) ? 'gone' : pick === w.id ? 'picked' : undefined}
        onPress={() => { setPick(w.id); void playSeq([wordAudio(L.id, w)]); }}><Ar size={22}>{w.ar}</Ar></Opt>)}</View>
      <View style={{ flex: 1, gap: 10 }}>{right.map(w => <Opt key={w.id} grow={false} label={w.en} state={gone.includes(w.id) ? 'gone' : wrong === w.id ? 'wrong' : undefined} onPress={() => {
        if (!pick) return;
        const pw = set.find(x => x.id === pick)!;
        if (w.id === pick) {
          sfx.right(); markWord(pw, true);
          const g = [...gone, w.id]; setGone(g); setPick(null); setWrong(null);
          if (g.length === set.length) setTimeout(finish, 600);
        } else { mistake(); markWord(pw, false); setWrong(w.id); }
      }}><T size={17} center>{w.en}</T></Opt>)}</View>
    </View>
    <KokoSays text="Find the pairs for me, Teacher!" />
  </View>;
}

export function Order({ L, finish, mistake, markWord }: StepProps) {
  const seq = useMemo(() => L.order!.items ?? L.order!.ids.map(id => L.words!.find(w => w.id === id)).filter((w): w is Word => Boolean(w)), []);
  const tiles = useMemo(() => shuffle(seq), []);
  const [n, setN] = useState(0), [shake, setShake] = useState<string | null>(null);
  useEffect(() => { if (!seq.length) finish(); }, []);   // never leave the child on an empty game
  return <View style={{ gap: 12 }}>
    <Card style={{ minHeight: 80, flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
      {seq.slice(0, n).map(w => <View key={w.id} style={[st.tile, { backgroundColor: C.greenSoft }]}><Ar size={20}>{w.ar}</Ar></View>)}
    </Card>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
      {tiles.filter(w => !seq.slice(0, n).includes(w)).map(w => <Pressable key={w.id} accessibilityRole="button" accessibilityLabel={w.en} onPress={() => {
        const want = seq[n]!;
        if (w.id === want.id) { sfx.right(); void playSeq([wordAudio(L.id, want)]); markWord(want, true); const m = n + 1; setN(m); if (m === seq.length) setTimeout(finish, 900); }
        else { mistake(); setShake(w.id); setTimeout(() => setShake(null), 400); }
      }} style={[st.tile, shake === w.id && { backgroundColor: C.redSoft }]}><Ar size={20}>{w.ar}</Ar><T size={12} color={C.muted}>{w.en}</T></Pressable>)}
    </View>
    <KokoSays text="Who is first? Tap them in order, Teacher!" />
  </View>;
}

export function Quiz({ L, finish, mistake }: StepProps) {
  const Q = L.quiz!;
  const [q, setQ] = useState(0), [right, setRight] = useState<number | null>(null), [wrongs, setWrongs] = useState<number[]>([]);
  const cur = Q[q]!;
  const order = useMemo(() => (cur.keep ? cur.opts.map((_, j) => j) : shuffle(cur.opts.map((_, j) => j))), [q]);
  useEffect(() => { setRight(null); setWrongs([]); }, [q]);
  return <View style={{ gap: 12 }}>
    <KokoSays text="Koko asks you a question. Tap the right answer!" />
    <Card style={{ alignItems: 'center' }}>{cur.ar ? <Ar size={24}>{cur.ar}</Ar> : null}<T size={cur.ar ? 16 : 20} center color={cur.ar ? C.muted : C.ink}>{cur.en}</T>
      <T size={12} color={C.muted}>Question {q + 1} of {Q.length}</T></Card>
    {order.map(j => { const o = cur.opts[j]!; return <Opt key={j} grow={false} label={o[1]} disabled={right !== null} state={right === j ? 'right' : wrongs.includes(j) ? 'wrong' : undefined} onPress={() => {
      if (o[2] === 1) { sfx.right(); setRight(j); setTimeout(() => (q + 1 < Q.length ? setQ(q + 1) : finish()), 900); }
      else { mistake(); setWrongs([...wrongs, j]); }
    }}>{o[0] ? <><Ar size={22}>{o[0]}</Ar><T size={14} color={C.muted}>{o[1]}</T></> : <T size={18} center>{o[1]}</T>}</Opt>; })}
  </View>;
}

const st = StyleSheet.create({
  opt: { minHeight: 64, borderRadius: 18, padding: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 3, gap: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  playBig: { alignSelf: 'center', width: 96, height: 96, borderRadius: 48, backgroundColor: C.yellow, alignItems: 'center', justifyContent: 'center' },
  tile: { backgroundColor: C.white, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center' },
});
