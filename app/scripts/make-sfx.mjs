// Writes the three game sounds as small WAV files (app/assets/sfx). They are the same tones the PWA makes live with
// Web Audio in app.js blip(): the same notes, wave shapes, 90 ms spacing, volume (0.16) and fades.
// Run: node app/scripts/make-sfx.mjs. The output is deterministic, so a re-run gives identical files.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RATE = 22050;
const wave = {
  triangle: p => 1 - 4 * Math.abs(Math.round(p - 0.25) - (p - 0.25)),
  sawtooth: p => 2 * (p - Math.floor(p + 0.5)),
};

function blip(freqs, dur = 0.12, type = 'triangle') {
  const end = (freqs.length - 1) * 0.09 + dur + 0.05;
  const out = new Float64Array(Math.ceil(end * RATE));
  freqs.forEach((f, i) => {
    const t0 = i * 0.09;
    for (let n = Math.floor(t0 * RATE); n < Math.min(out.length, Math.ceil((t0 + dur + 0.05) * RATE)); n++) {
      const t = n / RATE - t0;
      if (t < 0) continue;
      // exponentialRampToValueAtTime: 0.0001 → 0.16 over 20 ms, then → 0.0001 at dur
      const g = t <= 0.02 ? 0.0001 * Math.pow(0.16 / 0.0001, t / 0.02)
        : t <= dur ? 0.16 * Math.pow(0.0001 / 0.16, (t - 0.02) / (dur - 0.02)) : 0.0001;
      out[n] += g * wave[type](f * t);
    }
  });
  return out;
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(s * 32767))), i * 2));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

const dir = fileURLToPath(new URL('../assets/sfx/', import.meta.url));
const sounds = {   // app.js: const sfx = { right, wrong, win }
  right: blip([660, 880, 1175]),
  wrong: blip([300, 220], 0.16, 'sawtooth'),
  win: blip([523, 659, 784, 1047], 0.22),
};
for (const [name, s] of Object.entries(sounds)) writeFileSync(dir + name + '.wav', wav(s));
