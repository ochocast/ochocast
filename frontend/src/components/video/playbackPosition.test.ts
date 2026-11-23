import { lastReachedIndex } from './playbackPosition';

describe('lastReachedIndex', () => {
  const starts = [95, 1012.48, 2560.9];

  it('is -1 before the first start', () => {
    expect(lastReachedIndex(starts, 0)).toBe(-1);
    expect(lastReachedIndex(starts, 94.99)).toBe(-1);
    expect(lastReachedIndex([], 100)).toBe(-1);
  });

  it('reaches a start on its exact second', () => {
    expect(lastReachedIndex(starts, 95)).toBe(0);
    expect(lastReachedIndex([95.5], 95)).toBe(0);
  });

  it('reaches a fractional start from its whole second', () => {
    // A result link carries ?t=1012 for a passage starting at 1012.48.
    expect(lastReachedIndex(starts, 1011.99)).toBe(0);
    expect(lastReachedIndex(starts, 1012)).toBe(1);
    expect(lastReachedIndex(starts, 1012.2)).toBe(1);
    expect(lastReachedIndex(starts, 2560)).toBe(2);
  });

  it('keeps the last start once every start is reached', () => {
    expect(lastReachedIndex(starts, 99999)).toBe(2);
  });
});
