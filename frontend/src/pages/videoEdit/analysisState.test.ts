import { applyAnalysisCuts } from './analysisState';
import { EditSegment } from './editorState';
const segment = (a = 0, b = 20): EditSegment => ({
  key: `${a}-${b}`,
  sourceStart: a,
  sourceEnd: b,
  textLayers: [],
});
it('applies selected source times after reorder and keeps text around the cut', () => {
  const first = segment(30, 50),
    second = segment(0, 20);
  second.textLayers = [
    {
      key: 'text',
      content: 'Crossing',
      startOffset: 8,
      duration: 4,
      position: 'bottom',
      color: 'white',
    },
  ];
  const result = applyAnalysisCuts([first, second], [10]);
  expect(result.error).toBeUndefined();
  expect(result.segments.map((s) => [s.sourceStart, s.sourceEnd])).toEqual([
    [30, 50],
    [0, 10],
    [10, 20],
  ]);
  expect(result.segments[1].textLayers[0].duration).toBe(2);
  expect(result.segments[2].textLayers[0]).toMatchObject({
    startOffset: 0,
    duration: 2,
  });
});
it('refuses cuts in deleted intervals without replacing local edits', () => {
  const segments = [segment(0, 10), segment(20, 30)];
  const result = applyAnalysisCuts(segments, [15]);
  expect(result.error).toBe('outside');
  expect(result.segments).toBe(segments);
});
it('revalidates cuts together, preserving 5 seconds between all boundaries', () => {
  const list = [segment()];
  expect(applyAnalysisCuts(list, [5, 9]).error).toBe('short');
  expect(applyAnalysisCuts(list, [5, 10, 15]).segments).toHaveLength(4);
  expect(applyAnalysisCuts(list, [4]).segments).toBe(list);
});
it('does not exceed 100 passages', () => {
  const list = Array.from({ length: 100 }, (_, i) =>
    segment(i * 20, (i + 1) * 20),
  );
  expect(applyAnalysisCuts(list, [10]).error).toBe('limit');
});
it('never changes anything when no proposal is accepted', () => {
  const list = [segment()];
  expect(applyAnalysisCuts(list, []).segments).toBe(list);
});
