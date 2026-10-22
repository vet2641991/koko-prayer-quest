// Story (video), Learn cards, Words, Move and Think: the "show and tell" steps.
import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { lessonAudio, learnCardClip, wordAudio } from '../../../packages/shared/src/audio.ts';
import { playSeq, sfx } from '../audio/sound';
import { Ar, Btn, Card, KokoSays, T } from '../components/ui';
import { mediaUri, saveMedia } from '../data/content';
import { useProgress } from '../state/progress';
import { C } from '../theme';
import type { StepProps } from './types';

export function Story({ L, finish, firstTime }: StepProps) {
  const src = L.video!.src;
  const player = useVideoPlayer(mediaUri(src), p => { p.timeUpdateEventInterval = 1; });
  const [nearEnd, setNearEnd] = useState(!firstTime);
  useEffect(() => { void saveMedia([src]); }, [src]);   // keep the cartoon for offline use
  useEventListener(player, 'timeUpdate', ({ currentTime }) => { if (player.duration && currentTime / player.duration > 0.9) setNearEnd(true); });
  useEventListener(player, 'playToEnd', () => finish());
  return <View style={{ gap: 12 }}>
    <Card style={{ padding: 10 }}>
      <Ar size={22}>{L.title.ar}</Ar>
      <VideoView player={player} style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 14, backgroundColor: '#000' }} nativeControls contentFit="contain" />
      <T size={15} weight="medium" color={C.muted}>{nearEnd ? 'Well done! Tap Next.' : 'Watch to the end to go on.'}</T>
    </Card>
    {nearEnd ? <Btn label="Next →" onPress={() => { player.pause(); finish(); }} /> : null}
  </View>;
}

export function Learn({ L, finish }: StepProps) {
  const cards = L.learn!;
  const [k, setK] = useState(0);
  const c = cards[k]!;
  const clip = learnCardClip(L, k);
  const read = () => playSeq([...(clip ? [clip] : []), { en: (c.title ? `${c.title}. ` : '') + c.en }]);
  useEffect(() => { void read(); }, [k]);
  return <View style={{ gap: 12 }}>
    <Card style={{ gap: 10 }}>
      <T size={13} color={C.muted}>{c.title.toUpperCase()} · {k + 1} OF {cards.length}</T>
      {c.ar ? <View><Ar size={38}>{c.ar}</Ar>{c.tr ? <T center weight="medium" color={C.muted}>{c.tr}</T> : null}</View> : null}
      <T size={20} style={{ lineHeight: 29 }}>{c.en}</T>
      <Btn label="🔊 Read it to me" kind="soft" onPress={read} />
    </Card>
    <KokoSays text={c.koko ?? (k + 1 < cards.length ? 'Wow! Tell me more, Teacher!' : 'I understand now — thank you!')} />
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Btn label="Back" kind="soft" disabled={!k} onPress={() => setK(k - 1)} style={{ flex: 1 }} />
      <Btn label={k + 1 < cards.length ? 'Next idea' : 'Done!'} onPress={() => (k + 1 < cards.length ? setK(k + 1) : finish())} style={{ flex: 2 }} />
    </View>
  </View>;
}

export function Words({ L, finish, markWord }: StepProps) {
  const W = L.words!;
  const { progress } = useProgress();
  const [k, setK] = useState(0);
  const w = W[k]!;
  const say = (which: 'both' | 'ar' | 'en') => playSeq(which === 'ar' ? [wordAudio(L.id, w)] : which === 'en' ? [{ en: w.en }] : [wordAudio(L.id, w), { en: w.en }]);
  useEffect(() => { markWord(w, null); void say('both'); }, [k]);
  return <View style={{ gap: 12 }}>
    <Card style={{ alignItems: 'center', paddingVertical: 24 }}>
      {w.badge ? <View style={{ backgroundColor: C.yellow, borderRadius: 999, paddingHorizontal: 12 }}><T>{w.badge}</T></View> : null}
      <Ar size={44}>{w.ar}</Ar>
      {w.tr ? <T size={18} weight="medium" color={C.muted} style={{ fontStyle: 'italic' }}>{w.tr}</T> : null}
      <T size={24} center>{w.en}</T>
      <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch' }}>
        <Btn label="🔊 Arabic" onPress={() => say('ar')} style={{ flex: 1 }} />
        <Btn label="🔊 English" kind="soft" onPress={() => say('en')} style={{ flex: 1 }} />
      </View>
    </Card>
    <KokoSays text={`Teacher ${progress.name || 'friend'}, say it out loud so I can copy you!`} />
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Btn label="Back" kind="soft" disabled={!k} onPress={() => setK(k - 1)} style={{ flex: 1 }} />
      <Btn label={k + 1 < W.length ? 'I said it — next' : 'Done!'} onPress={() => (k + 1 < W.length ? setK(k + 1) : finish())} style={{ flex: 2 }} />
    </View>
  </View>;
}

export function Move({ L, finish }: StepProps) {
  const hear = () => playSeq([lessonAudio(L.id, 'x-move-ar'), { en: L.move!.en }]);
  useEffect(() => { void hear(); }, []);
  return <View style={{ gap: 12 }}>
    <Card style={{ alignItems: 'center', paddingVertical: 24 }}>
      <Ar size={30}>{L.move!.ar}</Ar>
      <T size={19} center>{L.move!.en}</T>
      <Btn label="🔊 Hear it" kind="soft" onPress={hear} />
    </Card>
    <Btn label="I did it!" kind="blue" onPress={() => { sfx.right(); finish(); }} />
  </View>;
}

export function Think({ L, finish }: StepProps) {
  const [show, setShow] = useState(false);
  useEffect(() => { void playSeq([{ en: L.think!.q }]); }, []);
  return <View style={{ gap: 12 }}>
    <Card style={{ alignItems: 'center', paddingVertical: 24, gap: 14 }}>
      <T size={22} center style={{ lineHeight: 31 }}>{L.think!.q}</T>
      {show ? <View style={{ backgroundColor: C.blueSoft, borderRadius: 16, padding: 12 }}><T>{L.think!.a}</T></View>
        : L.think!.a ? <Btn label="Show Koko's answer" kind="soft" onPress={() => { setShow(true); void playSeq([{ en: L.think!.a! }]); }} /> : null}
    </Card>
    <Btn label="We talked about it!" onPress={() => { sfx.right(); finish(); }} />
  </View>;
}
