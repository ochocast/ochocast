import {
  parseSearchQuery,
  QueryTooLongError,
  TooManyGroupsError,
} from './query-parser';

const terms = (...alternatives: string[]) => ({
  kind: 'terms' as const,
  alternatives,
});

describe('parseSearchQuery', () => {
  it('parses a single word', () => {
    expect(parseSearchQuery('kubernetes').groups).toEqual([
      terms('kubernetes'),
    ]);
  });

  it('parses a quoted expression as a phrase', () => {
    expect(parseSearchQuery('"données personnelles"').groups).toEqual([
      { kind: 'phrase', text: 'données personnelles' },
    ]);
  });

  it('parses an excluded term', () => {
    expect(parseSearchQuery('ffmpeg -audio')).toMatchObject({
      groups: [terms('ffmpeg')],
      excluded: ['audio'],
    });
  });

  it('joins two words with or, in any case', () => {
    expect(parseSearchQuery('ffmpeg or rgpd').groups).toEqual([
      terms('ffmpeg', 'rgpd'),
    ]);
    expect(parseSearchQuery('ffmpeg OR rgpd').groups).toEqual(
      parseSearchQuery('ffmpeg or rgpd').groups,
    );
    expect(parseSearchQuery('ffmpeg Or rgpd').groups).toEqual(
      parseSearchQuery('ffmpeg or rgpd').groups,
    );
  });

  it('merges chained or into one group', () => {
    expect(parseSearchQuery('a or b or c').groups).toEqual([
      terms('a', 'b', 'c'),
    ]);
  });

  it('treats or at the start or end as an ordinary word', () => {
    expect(parseSearchQuery('or rgpd').groups).toEqual([
      terms('or'),
      terms('rgpd'),
    ]);
    expect(parseSearchQuery('rgpd or').groups).toEqual([
      terms('rgpd'),
      terms('or'),
    ]);
  });

  it('treats or next to a phrase or an excluded term as an ordinary word', () => {
    expect(parseSearchQuery('"a b" or c').groups).toEqual([
      { kind: 'phrase', text: 'a b' },
      terms('or'),
      terms('c'),
    ]);
    expect(parseSearchQuery('a or "b c"').groups).toEqual([
      terms('a'),
      terms('or'),
      { kind: 'phrase', text: 'b c' },
    ]);
    const excluded = parseSearchQuery('a or -b');
    expect(excluded.groups).toEqual([terms('a'), terms('or')]);
    expect(excluded.excluded).toEqual(['b']);
  });

  it('keeps hyphens inside words', () => {
    expect(parseSearchQuery('porte-monnaie').groups).toEqual([
      terms('porte-monnaie'),
    ]);
  });

  it('ignores an unclosed quote', () => {
    expect(parseSearchQuery('"open').groups).toEqual([terms('open')]);
  });

  it('keeps an exclusion when its quote is unclosed', () => {
    expect(parseSearchQuery('-"open')).toMatchObject({
      groups: [],
      excluded: ['open'],
    });
  });

  it('excludes a quoted expression', () => {
    expect(parseSearchQuery('a -"some expression"')).toMatchObject({
      groups: [terms('a')],
      excluded: ['some expression'],
    });
  });

  it('drops a lone dash or a dash followed only by stripped characters', () => {
    expect(parseSearchQuery('a - b')).toMatchObject({
      groups: [terms('a'), terms('b')],
      excluded: [],
    });
    expect(parseSearchQuery('a -!').excluded).toEqual([]);
    expect(parseSearchQuery('a -*').excluded).toEqual([]);
  });

  it('is not empty when there are only exclusions', () => {
    expect(parseSearchQuery('-audio')).toMatchObject({
      groups: [],
      excluded: ['audio'],
      isEmpty: false,
    });
  });

  it('is empty for blank or missing input', () => {
    expect(parseSearchQuery('')).toMatchObject({ groups: [], isEmpty: true });
    expect(parseSearchQuery('   ')).toMatchObject({
      groups: [],
      isEmpty: true,
    });
    expect(parseSearchQuery(undefined).isEmpty).toBe(true);
  });

  it('keeps the raw input as given', () => {
    expect(parseSearchQuery('  ffmpeg  ').raw).toBe('  ffmpeg  ');
    expect(parseSearchQuery(undefined).raw).toBe('');
  });

  it('rejects input longer than 200 characters', () => {
    expect(() => parseSearchQuery('a'.repeat(201))).toThrow(QueryTooLongError);
    expect(() => parseSearchQuery('a'.repeat(200))).not.toThrow();
  });

  it('applies the length limit to the raw input, before trim', () => {
    expect(() => parseSearchQuery(' ' + 'a'.repeat(200))).toThrow(
      QueryTooLongError,
    );
  });

  it('rejects more than 10 groups', () => {
    expect(() => parseSearchQuery('a b c d e f g h i j k')).toThrow(
      TooManyGroupsError,
    );
    expect(parseSearchQuery('a b c d e f g h i j').groups).toHaveLength(10);
  });

  it('counts excluded terms in the 10 limit', () => {
    expect(() => parseSearchQuery('a b c d e f g h i -j -k')).toThrow(
      TooManyGroupsError,
    );
    expect(() => parseSearchQuery('a b c d e f g h i -j')).not.toThrow();
  });

  it('counts an or group once', () => {
    expect(parseSearchQuery('a or b c d e f g h i j k').groups).toHaveLength(
      10,
    );
  });

  it('exposes error classes that work with instanceof', () => {
    const error = new QueryTooLongError();
    expect(error).toBeInstanceOf(QueryTooLongError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('QueryTooLongError');
    expect(new TooManyGroupsError().name).toBe('TooManyGroupsError');
  });

  it('strips tsquery operators inside words', () => {
    const words = parseSearchQuery('a & b | !c :*').groups.flatMap((g) =>
      g.kind === 'terms' ? g.alternatives : [],
    );
    expect(words).toEqual(['a', 'b', 'c']);
    expect(parseSearchQuery('foo(bar)<baz>').groups).toEqual([
      terms('foobarbaz'),
    ]);
  });

  it('keeps apostrophes, accents and emoji', () => {
    expect(parseSearchQuery("l'été l’été 🎬").groups).toEqual([
      terms("l'été"),
      terms('l’été'),
      terms('🎬'),
    ]);
  });

  it('strips operators inside a phrase and normalizes its spaces', () => {
    expect(parseSearchQuery('"a & b"').groups).toEqual([
      { kind: 'phrase', text: 'a b' },
    ]);
  });
});
