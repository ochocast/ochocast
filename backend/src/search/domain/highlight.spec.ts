import { splitHighlight } from './highlight';

const START = '\u0002';
const STOP = '\u0003';

describe('splitHighlight', () => {
  it('splits marked text into parts', () => {
    expect(splitHighlight(`a ${START}b${STOP} c`)).toEqual([
      { text: 'a ', hit: false },
      { text: 'b', hit: true },
      { text: ' c', hit: false },
    ]);
  });

  it('returns one plain part for text without marks', () => {
    expect(splitHighlight('Déployer sur Kubernetes')).toEqual([
      { text: 'Déployer sur Kubernetes', hit: false },
    ]);
  });

  it('keeps markup as literal text', () => {
    expect(splitHighlight(`<b>${START}test${STOP}</b>`)).toEqual([
      { text: '<b>', hit: false },
      { text: 'test', hit: true },
      { text: '</b>', hit: false },
    ]);
    expect(splitHighlight('<b>test</b>')).toEqual([
      { text: '<b>test</b>', hit: false },
    ]);
  });

  it('returns no part for empty text', () => {
    expect(splitHighlight('')).toEqual([]);
  });

  it('merges adjacent parts and drops empty ones', () => {
    expect(
      splitHighlight(`${START}a${STOP}${START}b${STOP} ${START}${STOP}c`),
    ).toEqual([
      { text: 'ab', hit: true },
      { text: ' c', hit: false },
    ]);
  });

  it('removes unbalanced marks without showing them', () => {
    expect(splitHighlight(`a${STOP}b${START}c`)).toEqual([
      { text: 'abc', hit: false },
    ]);
    expect(splitHighlight(`${START}a${START}b${STOP}`)).toEqual([
      { text: 'a', hit: false },
      { text: 'b', hit: true },
    ]);
  });

  it('round-trips the text without its marks', () => {
    const text = `L’${START}école${STOP}, « ${START}ecole${STOP} » & <i>co</i>`;
    const joined = splitHighlight(text)
      .map((part) => part.text)
      .join('');
    expect(joined).toBe('L’école, « ecole » & <i>co</i>');
  });
});
