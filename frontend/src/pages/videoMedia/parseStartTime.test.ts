import { parseStartTime } from './parseStartTime';

describe('parseStartTime', () => {
  it.each([null, '', 'abc', '-5', 'NaN', 'Infinity'])('ignores %p', (raw) => {
    expect(parseStartTime(raw, 2712)).toBeNull();
  });

  it('reads a number of seconds', () => {
    expect(parseStartTime('1012', 2712)).toBe(1012);
    expect(parseStartTime('12.5', 2712)).toBe(12.5);
    expect(parseStartTime('0', 2712)).toBe(0);
  });

  it('clamps to the duration', () => {
    expect(parseStartTime('1e9', 2712)).toBe(2712);
  });

  it('does not clamp when the duration is unknown or 0', () => {
    expect(parseStartTime('1e9', null)).toBe(1e9);
    expect(parseStartTime('1e9', 0)).toBe(1e9);
  });
});
