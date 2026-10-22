// Sounds, as in the PWA: Arabic is always a recorded, approved clip (never synthesised); English meanings are read by
// the device's own voice. A new sound always cuts the one that is playing (app.js playSeq).
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';
import { mediaUri } from '../data/content';

export type SoundItem = string | { en: string } | { uri: string };   // string = a site path (audio/…/….mp3)

let player: AudioPlayer | null = null;
let token = 0;
let finishCurrent: ((ok: boolean) => void) | null = null;

export async function initAudio() {
  // children should hear Koko even when the phone's silent switch is on
  try { await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false }); } catch { /* web */ }
}

function getPlayer(): AudioPlayer {
  if (!player) {
    player = createAudioPlayer(null);
    player.addListener('playbackStatusUpdate', s => {
      if (s.didJustFinish && finishCurrent) { const f = finishCurrent; finishCurrent = null; f(true); }
      if (s.error && finishCurrent) { const f = finishCurrent; finishCurrent = null; f(false); }
    });
  }
  return player;
}

function playUri(uri: string): Promise<boolean> {
  return new Promise(resolve => {
    if (finishCurrent) { const f = finishCurrent; finishCurrent = null; f(false); }
    const p = getPlayer();
    let settled = false;
    const done = (ok: boolean) => { if (!settled) { settled = true; resolve(ok); } };
    finishCurrent = done;
    setTimeout(() => { if (finishCurrent === done) finishCurrent = null; done(false); }, 20000);   // never hang a step
    try { p.replace({ uri }); p.play(); } catch { done(false); }
  });
}

function speakEn(text: string): Promise<boolean> {
  return new Promise(resolve => {
    let settled = false;
    const done = (ok: boolean) => { if (!settled) { settled = true; resolve(ok); } };
    Speech.speak(text, { language: 'en-GB', rate: 0.9, pitch: 1.05, onDone: () => done(true), onStopped: () => done(false), onError: () => done(false) });
    setTimeout(() => done(false), 12000);
  });
}

/** Stops everything: the Arabic clip and the English voice. */
export function stopAll() {
  token++;
  try { player?.pause(); } catch { /* ignore */ }
  if (finishCurrent) { const f = finishCurrent; finishCurrent = null; f(false); }
  Speech.stop();
}

/** Plays items one after the other; a newer call cancels this one. */
export async function playSeq(items: SoundItem[]) {
  stopAll();
  const t = token;
  for (const it of items) {
    if (t !== token) return;
    if (typeof it === 'string') await playUri(mediaUri(it));
    else if ('uri' in it) await playUri(it.uri);
    else await speakEn(it.en);
    await new Promise(r => setTimeout(r, 250));
  }
}

// Game sounds (app.js sfx): short tones on their own players, so they never cut Koko's Arabic clip.
const SFX = { right: require('../../assets/sfx/right.wav'), wrong: require('../../assets/sfx/wrong.wav'), win: require('../../assets/sfx/win.wav') };
const sfxPlayers: Partial<Record<keyof typeof SFX, AudioPlayer>> = {};
function blip(name: keyof typeof SFX) {
  try {
    const p = (sfxPlayers[name] ??= createAudioPlayer(SFX[name]));
    p.seekTo(0).catch(() => {});
    p.play();
  } catch { /* a missing sound never stops the game */ }
}
export const sfx = { right: () => blip('right'), wrong: () => blip('wrong'), win: () => blip('win') };
