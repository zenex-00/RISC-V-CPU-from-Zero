// Practice ids per lesson, so mastery can be shown without loading every
// lesson bundle. A unit test checks these against the lesson files.
export const PRACTICE_COUNTS: Record<number, number> = {
  0: 1, 1: 2, 2: 5, 3: 5, 4: 6, 5: 7, 6: 7, 7: 7, 8: 7, 9: 6, 10: 4, 11: 5, 12: 1, 13: 1, 14: 3,
};
const EXTRA: Record<number, string[]> = { 10: ['10:lab-main', '10:lab-alu'], 12: ['12:predict', '12:compute'] };
export const PRACTICE_INDEX: Record<number, string[]> = Object.fromEntries(
  Object.entries(PRACTICE_COUNTS).map(([l, n]) => [l, [...Array.from({ length: n }, (_, i) => `${l}:${i}`), ...(EXTRA[+l] ?? [])]]),
);
