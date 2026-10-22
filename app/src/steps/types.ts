import type { Lesson } from '../../../packages/shared/src/schema.ts';
export type StepProps = {
  L: Lesson;
  finish: () => void;          // step done: next step, or the reward screen
  mistake: () => void;         // counts towards the stars
  markWord: (w: { id: string; from?: string }, ok: boolean | null) => void;
  firstTime: boolean;          // false when this step was finished before (e.g. the video may be skipped)
};
export const STEP_TITLES: Record<string, [string, string]> = {
  story: ["Koko's story", 'Watch the cartoon'], learn: ['Learn with Koko', 'Short ideas'], words: ['New words', 'Hear each word, then its meaning'],
  sounds: ['Letter sounds', 'Train your ears'], listen: ['Listen & choose', 'Tap the word Koko says'], match: ['Match the pairs', 'Arabic word ↔ English meaning'],
  order: ['Put them in order', ''], talk: ['Talk with Koko', 'Teach Koko the dialogue'], quiz: ["Koko's questions", 'Tap the right answer'],
  move: ['Move!', 'Up you get!'], think: ['Think & talk', 'Talk about it with Mum or Dad'],
};
export const STEP_MINUTES: Record<string, number> = { story: 3, learn: 3, words: 2, sounds: 2, listen: 2, match: 2, order: 2, talk: 3, quiz: 2, move: 1, think: 2 };
