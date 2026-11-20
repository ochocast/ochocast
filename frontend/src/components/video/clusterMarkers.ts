export interface MarkerCluster {
  /** Start (in seconds) of the first passage of the group. */
  start: number;
  /** Number of passages merged in this marker. */
  count: number;
  /** Position of the first passage along the strip, between 0 and 100. */
  leftPct: number;
}

const toFraction = (start: number, duration: number): number =>
  Math.min(1, Math.max(0, start / duration));

/**
 * Turns passage starts into strip markers. Markers closer than `minGapPx`
 * to the first marker of the current group are merged into it, so that no
 * two markers overlap. Nothing is merged while the width is unknown
 * (`widthPx <= 0`), and no marker exists while the duration is unknown.
 */
export const clusterMarkers = (
  starts: number[],
  duration: number,
  widthPx: number,
  minGapPx: number,
): MarkerCluster[] => {
  if (!Number.isFinite(duration) || duration <= 0) {
    return [];
  }
  const sorted = starts.filter(Number.isFinite).sort((a, b) => a - b);
  const canMerge = Number.isFinite(widthPx) && widthPx > 0;
  const clusters: MarkerCluster[] = [];
  let firstFraction = 0;

  sorted.forEach((start) => {
    const fraction = toFraction(start, duration);
    const current = clusters[clusters.length - 1];
    if (
      current &&
      canMerge &&
      (fraction - firstFraction) * widthPx < minGapPx
    ) {
      current.count += 1;
      return;
    }
    firstFraction = fraction;
    clusters.push({ start, count: 1, leftPct: fraction * 100 });
  });

  return clusters;
};
