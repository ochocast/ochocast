import { EditSegment, splitSegment } from './editorState';
export type CutApplication = {
  segments: EditSegment[];
  error?: 'outside' | 'short' | 'limit' | 'texts';
};
/** Source timestamps remain valid after reordering; local changes are revalidated. */
export function applyAnalysisCuts(
  segments: EditSegment[],
  proposed: number[],
): CutApplication {
  const cuts = [...new Set(proposed)].sort((a, b) => a - b);
  if (segments.length + cuts.length > 100) return { segments, error: 'limit' };
  if (
    cuts.some(
      (c) =>
        !Number.isFinite(c) ||
        !segments.some((s) => c > s.sourceStart && c < s.sourceEnd),
    )
  )
    return { segments, error: 'outside' };
  for (const segment of segments) {
    const boundaries = [
      segment.sourceStart,
      ...cuts.filter((c) => c > segment.sourceStart && c < segment.sourceEnd),
      segment.sourceEnd,
    ];
    if (
      boundaries.length > 2 &&
      boundaries.some((n, i) => i > 0 && n - boundaries[i - 1] < 5)
    )
      return { segments, error: 'short' };
  }
  let next = segments;
  for (const cut of cuts) {
    const segment = next.find((s) => cut > s.sourceStart && cut < s.sourceEnd)!;
    const split = splitSegment(next, segment.key, cut - segment.sourceStart);
    if (split === next) return { segments, error: 'texts' };
    next = split;
  }
  return { segments: next };
}
