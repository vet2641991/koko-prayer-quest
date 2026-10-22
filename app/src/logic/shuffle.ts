export function shuffle<T>(a: readonly T[], random: () => number = Math.random): T[] {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [b[i], b[j]] = [b[j]!, b[i]!]; }
  return b;
}
