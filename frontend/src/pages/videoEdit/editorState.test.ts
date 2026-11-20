import {
  EditSegment,
  hydrate,
  localKey,
  locate,
  moveSegment,
  nextJump,
  passageAt,
  passageStarts,
  payload,
  splitSegment,
  toMontage,
  toSource,
  totalDuration,
  validate,
  visibleTexts,
  wrapText,
} from './editorState';
const segment = (sourceStart = 0, sourceEnd = 20): EditSegment => ({
  key: localKey(),
  sourceStart,
  sourceEnd,
  textLayers: [],
});
const text = (startOffset = 0, duration = 10) => ({
  key: localKey(),
  content: 'Bonjour',
  position: 'bottom' as const,
  color: 'white' as const,
  startOffset,
  duration,
});
describe('video editor state', () => {
  it('permits exactly 5 seconds either side of a cut, rejects shorter sides and nonfinite times', () => {
    const s = segment(10, 20),
      list = [s];
    expect(splitSegment(list, s.key, 4.99)).toBe(list);
    expect(splitSegment(list, s.key, 5.01)).toBe(list);
    expect(splitSegment(list, s.key, NaN)).toBe(list);
    expect(
      splitSegment(list, s.key, 5).map((s) => [s.sourceStart, s.sourceEnd]),
    ).toEqual([
      [10, 15],
      [15, 20],
    ]);
  });
  it('clips crossing text and keeps offsets relative to the new segments', () => {
    const s = segment();
    s.textLayers = [text(8, 6)];
    const result = splitSegment([s], s.key, 10);
    expect(result[0].textLayers[0]).toMatchObject({
      startOffset: 8,
      duration: 2,
    });
    expect(result[1].textLayers[0]).toMatchObject({
      startOffset: 0,
      duration: 4,
    });
    expect(validate(result, 20)).toEqual([]);
    expect(s.textLayers[0].duration).toBe(6);
  });
  it('moves entire segments with their text and preserves total duration', () => {
    const a = segment(0, 10),
      b = segment(20, 40),
      c = segment(50, 60);
    b.textLayers = [text()];
    const result = moveSegment([a, b, c], b.key, 0);
    expect(result).toEqual([b, a, c]);
    expect(result[0].textLayers).toBe(b.textLayers);
    expect(totalDuration(result)).toBe(40);
    expect(moveSegment(result, b.key, 3)).toEqual([a, c, b]);
  });
  it('validates the first montage of a video longer than 45 minutes', () => {
    expect(validate([segment(0, 3012)], 3012)).toContainEqual({
      code: 'durationLimit',
    });
    expect(validate([segment(0, 2700)], 3012)).toEqual([]);
  });
  it('reports all validation failures without stopping at the first', () => {
    const a = segment(0, 10),
      b = segment(5, 30);
    b.textLayers = [{ ...text(24, 3), content: 'x'.repeat(121) }];
    expect(validate([a, b], 20).map((e) => e.code)).toEqual(
      expect.arrayContaining([
        'segmentBounds',
        'overlap',
        'textLength',
        'textBounds',
      ]),
    );
  });
  it('accepts touching source intervals and text ending exactly at the boundary', () => {
    const a = segment(0, 10);
    a.textLayers = [text(0, 10)];
    expect(validate([a, segment(10, 20)], 20)).toEqual([]);
  });
  it('enforces segment and text counts, empty montage and finite text times', () => {
    expect(validate([], 20)).toContainEqual({ code: 'segmentsLimit' });
    const list = Array.from({ length: 100 }, (_, i) =>
      segment(i * 10, i * 10 + 10),
    );
    expect(validate(list, 1010)).toEqual([]);
    expect(splitSegment(list, list[0].key, 5)).toBe(list);
    expect(validate([...list, segment(1000, 1010)], 1010)).toContainEqual({
      code: 'segmentsLimit',
    });
    const a = segment();
    a.textLayers = Array.from({ length: 11 }, () => text());
    a.textLayers[0].startOffset = NaN;
    expect(validate([a], 20).map((e) => e.code)).toEqual(
      expect.arrayContaining(['textsLimit', 'textBounds']),
    );
  });
  it('matches worker word wrapping, including long words', () => {
    expect(wrapText('x'.repeat(120)).map((l) => l.length)).toEqual([
      40, 40, 40,
    ]);
    expect(wrapText('hello   world\nagain')).toEqual(['hello world again']);
    expect(wrapText('abc ' + 'x'.repeat(41))).toEqual([
      'abc',
      'x'.repeat(40),
      'x',
    ]);
  });
  it('creates new local keys each time and strips server and local identifiers on save', () => {
    const edit = {
      version: 3,
      renderStatus: 'ready' as const,
      renderError: null,
      segments: [
        {
          ...segment(),
          id: 'server',
          textLayers: [{ ...text(), id: 'server-text' }],
        },
      ],
    };
    const first = hydrate(edit),
      second = hydrate(edit);
    expect(first[0].key).not.toBe(second[0].key);
    const body = payload(3, first);
    expect(body.version).toBe(3);
    expect(JSON.stringify(body)).not.toContain('key');
    expect(JSON.stringify(body)).not.toContain('server');
  });
  it('maps edited times to source intervals across reordered segments', () => {
    const list = [segment(30, 40), segment(0, 10)];
    expect(locate(list, 10)).toMatchObject({ index: 1, offset: 0, start: 10 });
    expect(locate(list, 15)?.segment.sourceStart).toBe(0);
    expect(locate(list, 30)?.offset).toBe(10);
    expect(locate([], 0)).toBeNull();
  });
});
it('drops text halves shorter than half a second but keeps exactly half a second', () => {
  const s = segment();
  s.textLayers = [text(9.6, 1)];
  const result = splitSegment([s], s.key, 10);
  expect(result[0].textLayers).toEqual([]);
  expect(result[1].textLayers[0].startOffset).toBe(0);
  expect(result[1].textLayers[0].duration).toBeCloseTo(0.6);
  s.textLayers = [text(9.5, 1)];
  expect(
    splitSegment([s], s.key, 10).map((s) => s.textLayers[0].duration),
  ).toEqual([0.5, 0.5]);
});
it('refuses a split that would exceed 10 text layers', () => {
  const s = segment();
  s.textLayers = Array.from({ length: 11 }, () => text(0, 15));
  const list = [s];
  expect(splitSegment(list, s.key, 10)).toBe(list);
});
it('preserves a short text that does not cross the cut', () => {
  const s = segment();
  s.textLayers = [text(1, 0.2)];
  expect(splitSegment([s], s.key, 10)[0].textLayers[0].duration).toBeCloseTo(
    0.2,
  );
});

describe('preview timing', () => {
  // Reordered: original 20-30 s first, then 0-5 s (a 5 s passage), then 5-12 s
  // which joins the previous one in the original.
  const reordered = () => [segment(20, 30), segment(0, 5), segment(5, 12)];

  it('places each passage on the montage timeline', () => {
    expect(passageStarts(reordered())).toEqual([0, 10, 15]);
    expect(passageStarts([])).toEqual([]);
  });

  it('converts montage time to the original and back', () => {
    const list = reordered();
    for (const [time, index, sourceTime] of [
      [0, 0, 20],
      [9.5, 0, 29.5],
      [10, 1, 0],
      [14.9, 1, 4.9],
      [15, 2, 5],
      [21.5, 2, 11.5],
    ]) {
      const at = toSource(list, time);
      expect(at?.index).toBe(index);
      expect(at?.offset).toBeCloseTo(time - passageStarts(list)[index], 6);
      expect(at?.sourceTime).toBeCloseTo(sourceTime, 6);
      expect(toMontage(list, index, sourceTime)).toBeCloseTo(time, 6);
    }
  });

  it('clamps times outside the montage and outside a passage', () => {
    const list = reordered();
    expect(toSource(list, -3)).toMatchObject({ index: 0, sourceTime: 20 });
    // Past the end: the last frame of the last passage.
    expect(toSource(list, 99)).toMatchObject({ index: 2, sourceTime: 12 });
    expect(toSource([], 3)).toBeNull();
    expect(toMontage(list, 1, -1)).toBe(10);
    expect(toMontage(list, 1, 8)).toBe(15);
    // A passage removed meanwhile: the end of the montage.
    expect(toMontage(list, 7, 3)).toBe(22);
  });

  it('finds the passage playing an original time, if any', () => {
    const list = reordered();
    expect(passageAt(list, 25)).toBe(0);
    expect(passageAt(list, 0)).toBe(1);
    expect(passageAt(list, 5)).toBe(2);
    expect(passageAt(list, 15)).toBeNull();
  });

  it('seeks to a passage elsewhere, plays on into a joined one, stops after the last', () => {
    const list = reordered();
    expect(nextJump(list, 0)).toEqual({
      kind: 'seek',
      index: 1,
      sourceTime: 0,
    });
    expect(nextJump(list, 1)).toEqual({ kind: 'continue', index: 2 });
    expect(nextJump(list, 2)).toEqual({ kind: 'end' });
    expect(nextJump(list, 5)).toEqual({ kind: 'end' });
    // A removed passage changes what follows.
    expect(nextJump([list[0], list[2]], 0)).toEqual({
      kind: 'seek',
      index: 1,
      sourceTime: 5,
    });
  });

  it('shows texts on both bounds of their interval, like the render', () => {
    const s = segment(0, 5);
    const first = text(0, 2),
      last = text(3, 2),
      whole = text(0, 5);
    s.textLayers = [first, last, whole];
    expect(visibleTexts(s, 0)).toEqual([first, whole]);
    expect(visibleTexts(s, 2)).toEqual([first, whole]);
    expect(visibleTexts(s, 2.5)).toEqual([whole]);
    expect(visibleTexts(s, 5)).toEqual([last, whole]);
    expect(visibleTexts(s, 5.01)).toEqual([]);
  });
});
