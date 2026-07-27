import { normalizeSearchValue } from './globalSearch';

describe('global search normalization', () => {
  it('normalizes strings and accents', () => {
    expect(normalizeSearchValue('Événement TEST')).toBe('evenement test');
  });

  it('does not crash on non-string API values', () => {
    expect(normalizeSearchValue(['Mot-clé', 2026])).toBe('mot-cle 2026');
    expect(normalizeSearchValue({ unexpected: 'value' })).toBe('');
    expect(normalizeSearchValue(null)).toBe('');
  });
});
