import { secretMatches } from 'src/common/secret-matches';

describe('secretMatches', () => {
  it('accepts the exact secret only', () => {
    expect(secretMatches('s3cret', 's3cret')).toBe(true);
    expect(secretMatches('s3cret', 's3creT')).toBe(false);
    expect(secretMatches('s3cret', 's3cre')).toBe(false);
    expect(secretMatches('s3cret', undefined)).toBe(false);
    expect(secretMatches('s3cret', ['s3cret'])).toBe(false);
  });

  it('refuses, without throwing, a header of the same length in characters but not in bytes', () => {
    expect(() => secretMatches('abcdef', 'abcdeé')).not.toThrow();
    expect(secretMatches('abcdef', 'abcdeé')).toBe(false);
  });
});
