import { formatTimestamp } from './formatTimestamp';

describe('formatTimestamp', () => {
  it('formats minutes and seconds', () => {
    expect(formatTimestamp(95)).toBe('1:35');
    expect(formatTimestamp(1012)).toBe('16:52');
    expect(formatTimestamp(2560)).toBe('42:40');
    expect(formatTimestamp(0)).toBe('0:00');
  });

  it('adds hours from one hour', () => {
    expect(formatTimestamp(3723)).toBe('1:02:03');
  });

  it('floors fractional seconds', () => {
    expect(formatTimestamp(95.9)).toBe('1:35');
  });
});
