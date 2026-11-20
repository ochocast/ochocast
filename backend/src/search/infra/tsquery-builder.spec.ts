import { parseSearchQuery } from '../domain/query-parser';
import { buildTsQueries } from './tsquery-builder';

const build = (input: string, params: unknown[] = []) =>
  buildTsQueries(parseSearchQuery(input), params);

describe('buildTsQueries', () => {
  it('never inlines user text', () => {
    const params: unknown[] = [];
    const evil = `x'; DROP TABLE y; --`;
    const queries = build(evil, params)!;
    for (const fragment of Object.values(queries)) {
      expect(fragment).not.toContain('DROP');
      expect(fragment).not.toContain(evil);
    }
    expect(params).toContain(`x';`);
    expect(params).toContain('DROP');
  });

  it('keeps the whole phrase as a single parameter', () => {
    const params: unknown[] = [];
    build(`"x'; DROP TABLE y; --"`, params);
    expect(params).toEqual([`x'; DROP TABLE y; --`]);
  });

  it('combines groups and exclusions', () => {
    const params: unknown[] = [];
    const queries = build('ffmpeg -audio', params)!;
    expect(params).toEqual(['ffmpeg', 'audio']);
    expect(queries.all).toBe(
      `((plainto_tsquery('ochocast_fr', $1)) && !!(plainto_tsquery('ochocast_fr', $2)))`,
    );
    expect(queries.any).toBe(`((plainto_tsquery('ochocast_fr', $1)))`);
    expect(queries.positive).toBe(`((plainto_tsquery('ochocast_fr', $1)))`);
    expect(queries.exact).toBe(
      `((plainto_tsquery('ochocast_exact', $1)) && !!(plainto_tsquery('ochocast_exact', $2)))`,
    );
  });

  it('requires every group in all and positive, any group in any', () => {
    const queries = build('ffmpeg rgpd')!;
    expect(queries.all).toBe(
      `((plainto_tsquery('ochocast_fr', $1)) && (plainto_tsquery('ochocast_fr', $2)))`,
    );
    expect(queries.positive).toBe(queries.all);
    expect(queries.any).toBe(
      `((plainto_tsquery('ochocast_fr', $1)) || (plainto_tsquery('ochocast_fr', $2)))`,
    );
  });

  it('uses phraseto_tsquery for phrases', () => {
    const params: unknown[] = [];
    const queries = build('"données personnelles"', params)!;
    expect(params).toEqual(['données personnelles']);
    expect(queries.all).toBe(`((phraseto_tsquery('ochocast_fr', $1)))`);
    expect(queries.exact).toBe(`((phraseto_tsquery('ochocast_exact', $1)))`);
  });

  it('uses || between alternatives', () => {
    const params: unknown[] = [];
    const queries = build('ffmpeg or rgpd', params)!;
    expect(params).toEqual(['ffmpeg', 'rgpd']);
    expect(queries.all).toBe(
      `((plainto_tsquery('ochocast_fr', $1) || plainto_tsquery('ochocast_fr', $2)))`,
    );
    expect(queries.any).toBe(queries.all);
  });

  it('parenthesises an alternatives group inside a conjunction', () => {
    const queries = build('a or b c')!;
    expect(queries.all).toBe(
      `((plainto_tsquery('ochocast_fr', $1) || plainto_tsquery('ochocast_fr', $2)) && (plainto_tsquery('ochocast_fr', $3)))`,
    );
  });

  it('excludes multi-word entries with phraseto_tsquery', () => {
    const params: unknown[] = [];
    const queries = build('ffmpeg -"mauvais son"', params)!;
    expect(params).toEqual(['ffmpeg', 'mauvais son']);
    expect(queries.all).toBe(
      `((plainto_tsquery('ochocast_fr', $1)) && !!(phraseto_tsquery('ochocast_fr', $2)))`,
    );
    expect(queries.positive).toBe(`((plainto_tsquery('ochocast_fr', $1)))`);
  });

  it('continues numbering after existing parameters', () => {
    const params: unknown[] = ['viewer-id', 20];
    const queries = build('ffmpeg -audio', params)!;
    expect(params).toEqual(['viewer-id', 20, 'ffmpeg', 'audio']);
    expect(queries.all).toContain('$3');
    expect(queries.all).toContain('$4');
    expect(queries.all).not.toContain('$1');
  });

  it('pushes a repeated string once and reuses its parameter', () => {
    const params: unknown[] = [];
    const queries = build('ffmpeg ffmpeg -ffmpeg', params)!;
    expect(params).toEqual(['ffmpeg']);
    expect(queries.all).toBe(
      `((plainto_tsquery('ochocast_fr', $1)) && (plainto_tsquery('ochocast_fr', $1)) && !!(plainto_tsquery('ochocast_fr', $1)))`,
    );
  });

  it('never uses the french configuration', () => {
    const queries = build('ffmpeg or rgpd "données" -audio')!;
    for (const fragment of Object.values(queries)) {
      expect(fragment).not.toMatch(/'french'/);
    }
  });

  it('returns null without required groups', () => {
    expect(build('')).toBeNull();
    expect(build('   ')).toBeNull();
    expect(build('-audio')).toBeNull();
  });

  it('leaves params untouched when it returns null', () => {
    const params: unknown[] = ['kept'];
    build('-audio', params);
    expect(params).toEqual(['kept']);
  });
});
