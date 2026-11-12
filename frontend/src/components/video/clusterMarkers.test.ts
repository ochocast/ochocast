import { clusterMarkers } from './clusterMarkers';

describe('clusterMarkers', () => {
  it('returns no markers when duration is 0', () => {
    expect(clusterMarkers([10, 20], 0, 400, 12)).toEqual([]);
  });

  it('returns no markers when duration is unknown or invalid', () => {
    expect(clusterMarkers([10], null as unknown as number, 400, 12)).toEqual(
      [],
    );
    expect(clusterMarkers([10], NaN, 400, 12)).toEqual([]);
    expect(clusterMarkers([10], -5, 400, 12)).toEqual([]);
  });

  it('returns no markers when there is no start', () => {
    expect(clusterMarkers([], 100, 400, 12)).toEqual([]);
  });

  it('places markers at start / duration', () => {
    const [cluster] = clusterMarkers([1012], 2712, 1000, 12);
    expect(cluster.start).toBe(1012);
    expect(cluster.count).toBe(1);
    expect(cluster.leftPct).toBeCloseTo(37.32, 2);
  });

  it('clusters close markers', () => {
    // ten passages within 5 s on a 375 px touch strip
    const spread = Array.from({ length: 10 }, (_, i) => 100 + i * (5 / 9));
    const clusters = clusterMarkers(spread, 2712, 375, 44);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].count).toBe(10);
    expect(clusters[0].start).toBe(100);
  });

  it('keeps the first start of the group as its position', () => {
    const clusters = clusterMarkers([300, 100, 101], 1000, 1000, 12);
    expect(clusters.map((c) => [c.start, c.count])).toEqual([
      [100, 2],
      [300, 1],
    ]);
  });

  it('keeps edge markers inside the strip', () => {
    const clusters = clusterMarkers([0, 2712], 2712, 375, 44);
    expect(clusters).toHaveLength(2);
    clusters.forEach((c) => {
      expect(c.leftPct).toBeGreaterThanOrEqual(0);
      expect(c.leftPct).toBeLessThanOrEqual(100);
    });
    expect(clusters[0].leftPct).toBe(0);
    expect(clusters[1].leftPct).toBe(100);
  });

  it('puts starts beyond the duration at the end of the strip', () => {
    const clusters = clusterMarkers([50, 120, 999], 100, 1000, 12);
    expect(clusters.map((c) => c.leftPct)).toEqual([50, 100]);
    expect(clusters[1].count).toBe(2);
    expect(clusters[1].start).toBe(120);
  });

  it('never overlaps', () => {
    const starts = Array.from({ length: 200 }, (_, i) => (i * 37) % 2712);
    [
      { widthPx: 375, minGapPx: 44 },
      { widthPx: 1000, minGapPx: 12 },
      { widthPx: 120, minGapPx: 44 },
    ].forEach(({ widthPx, minGapPx }) => {
      const clusters = clusterMarkers(starts, 2712, widthPx, minGapPx);
      expect(clusters.reduce((n, c) => n + c.count, 0)).toBe(starts.length);
      for (let i = 1; i < clusters.length; i += 1) {
        const gap =
          ((clusters[i].leftPct - clusters[i - 1].leftPct) / 100) * widthPx;
        expect(gap).toBeGreaterThanOrEqual(minGapPx);
      }
    });
  });

  it('does not merge anything when the width is unknown', () => {
    const clusters = clusterMarkers([10, 10, 11], 100, 0, 44);
    expect(clusters.map((c) => c.count)).toEqual([1, 1, 1]);
  });
});
