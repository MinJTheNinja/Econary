/** 편향 없는 무작위 섞기 (Fisher–Yates). 원본은 바꾸지 않는다. random 은 테스트용으로 바꿀 수 있다 */
export function shuffle<T>(xs: readonly T[], random: () => number = Math.random): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
