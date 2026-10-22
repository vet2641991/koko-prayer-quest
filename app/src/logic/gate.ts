// Parental gate (Google Play Families, Apple Kids category): before leaving the app or showing anything aimed at
// parents, a grown-up must answer a question a young child cannot: a multiplication written out in words.
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

export type GateQuestion = { text: string; answer: number };

export function gateQuestion(random: () => number = Math.random): GateQuestion {
  const a = 6 + Math.floor(random() * 7);   // 6..12
  const b = 3 + Math.floor(random() * 7);   // 3..9
  return { text: `What is ${WORDS[a]} times ${WORDS[b]}?`, answer: a * b };
}

export const gateAccepts = (q: GateQuestion, typed: string) => /^\s*\d+\s*$/.test(typed) && Number(typed) === q.answer;
