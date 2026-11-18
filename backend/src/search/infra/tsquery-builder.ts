import { ParsedQuery, QueryGroup } from '../domain/search.types';

// Language -> PostgreSQL text search configuration. Names are fixed literals,
// never derived from user input.
export const SEARCH_CONFIG = { fr: 'ochocast_fr' } as const;
// Unstemmed configuration used to rank exact-form matches.
export const EXACT_CONFIG = 'ochocast_exact';

const DEFAULT_LANGUAGE = 'fr';

export interface TsQueries {
  /** Required groups (&&) and every exclusion negated (!!). */
  all: string;
  /** Required groups combined with ||, no exclusions. */
  any: string;
  /** Required groups combined with &&, no exclusions. */
  positive: string;
  /** Same as `all`, on the unstemmed configuration. */
  exact: string;
}

/**
 * Builds SQL fragments evaluating to `tsquery` from a parsed query. User text
 * is only ever bound through `$n` placeholders appended to `params`; each
 * distinct string is pushed once and reused by every fragment. Returns null
 * when there is no required group.
 */
export function buildTsQueries(
  q: ParsedQuery,
  params: unknown[],
): TsQueries | null {
  if (q.groups.length === 0) return null;

  const placeholders = new Map<string, string>();
  const bind = (value: string): string => {
    let placeholder = placeholders.get(value);
    if (!placeholder) {
      params.push(value);
      placeholder = `$${params.length}`;
      placeholders.set(value, placeholder);
    }
    return placeholder;
  };

  const word = (config: string, text: string) =>
    `plainto_tsquery('${config}', ${bind(text)})`;
  const phrase = (config: string, text: string) =>
    `phraseto_tsquery('${config}', ${bind(text)})`;
  const group = (config: string, g: QueryGroup) =>
    g.kind === 'phrase'
      ? `(${phrase(config, g.text)})`
      : `(${g.alternatives.map((a) => word(config, a)).join(' || ')})`;
  const excluded = (config: string, text: string) =>
    `!!(${/\s/.test(text) ? phrase(config, text) : word(config, text)})`;

  const positive = (config: string) =>
    q.groups.map((g) => group(config, g)).join(' && ');
  const withExclusions = (config: string) =>
    [positive(config), ...q.excluded.map((e) => excluded(config, e))].join(
      ' && ',
    );

  const fr = SEARCH_CONFIG[DEFAULT_LANGUAGE];
  return {
    all: withExclusions(fr),
    any: q.groups.map((g) => group(fr, g)).join(' || '),
    positive: positive(fr),
    exact: withExclusions(EXACT_CONFIG),
  };
}
