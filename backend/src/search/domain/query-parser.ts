import { ParsedQuery, QueryGroup } from './search.types';

const MAX_QUERY_LENGTH = 200;
// Words, phrases and excluded terms: every alternative of an `or` counts.
const MAX_TERMS = 10;

export class QueryTooLongError extends Error {
  constructor() {
    super(`Search query is longer than ${MAX_QUERY_LENGTH} characters`);
    this.name = 'QueryTooLongError';
    Object.setPrototypeOf(this, QueryTooLongError.prototype);
  }
}

export class TooManyGroupsError extends Error {
  constructor() {
    super(`Search query has more than ${MAX_TERMS} words or expressions`);
    this.name = 'TooManyGroupsError';
    Object.setPrototypeOf(this, TooManyGroupsError.prototype);
  }
}

type Token =
  | { type: 'word'; text: string }
  | { type: 'phrase'; text: string }
  | { type: 'excluded'; text: string };

// tsquery operators have no meaning in our syntax.
const OPERATOR_CHARS = /[&|!:*()<>]/g;

// Tab, newline and carriage return separate words; other control characters
// (NUL, the U+0002/U+0003 highlight markers, DEL...) are removed. Typographic
// quotes (smart punctuation on mobile keyboards) act as plain quotes.
function normalizeInput(input: string): string {
  return (
    input
      .replace(/[\t\n\r]/g, ' ')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/[\u201c\u201d\u201e\u00ab\u00bb]/g, '"')
  );
}

function cleanWord(text: string): string {
  return text.replace(OPERATOR_CHARS, '').replace(/^-+|-+$/g, '');
}

function cleanPhrase(text: string): string {
  return text.replace(OPERATOR_CHARS, '').replace(/\s+/g, ' ').trim();
}

// An odd number of quotes leaves the last one unclosed: it is ignored.
function dropUnclosedQuote(input: string): string {
  const quoteCount = input.split('"').length - 1;
  if (quoteCount % 2 === 0) return input;
  const last = input.lastIndexOf('"');
  return input.slice(0, last) + input.slice(last + 1);
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    if (/\s/.test(input[i])) {
      i++;
      continue;
    }
    const excluded = input[i] === '-';
    const quoteAt = excluded ? i + 1 : i;
    if (input[quoteAt] === '"') {
      const close = input.indexOf('"', quoteAt + 1);
      const text = cleanPhrase(input.slice(quoteAt + 1, close));
      i = close + 1;
      if (text) tokens.push({ type: excluded ? 'excluded' : 'phrase', text });
      continue;
    }
    let end = i;
    while (end < input.length && !/\s/.test(input[end]) && input[end] !== '"') {
      end++;
    }
    const text = cleanWord(input.slice(excluded ? i + 1 : i, end));
    i = end;
    if (text) tokens.push({ type: excluded ? 'excluded' : 'word', text });
  }
  return tokens;
}

const isOr = (token: Token | undefined): boolean =>
  token?.type === 'word' && token.text.toLowerCase() === 'or';

function buildGroups(tokens: Token[]): {
  groups: QueryGroup[];
  excluded: string[];
} {
  const groups: QueryGroup[] = [];
  const excluded: string[] = [];
  // True when the previous token was a plain word that started or extended a group.
  let afterWord = false;
  let joinNext = false;

  tokens.forEach((token, index) => {
    if (token.type === 'excluded') {
      excluded.push(token.text);
      afterWord = false;
      return;
    }
    if (token.type === 'phrase') {
      groups.push({ kind: 'phrase', text: token.text });
      afterWord = false;
      return;
    }
    if (isOr(token) && afterWord && tokens[index + 1]?.type === 'word') {
      joinNext = true;
      afterWord = false;
      return;
    }
    const last = groups[groups.length - 1];
    if (joinNext && last?.kind === 'terms') {
      last.alternatives.push(token.text);
    } else {
      groups.push({ kind: 'terms', alternatives: [token.text] });
    }
    joinNext = false;
    afterWord = true;
  });

  return { groups, excluded };
}

export function parseSearchQuery(input: string | undefined): ParsedQuery {
  const raw = input ?? '';
  if (raw.length > MAX_QUERY_LENGTH) throw new QueryTooLongError();

  const { groups, excluded } = buildGroups(
    tokenize(dropUnclosedQuote(normalizeInput(raw))),
  );
  const words = groups.reduce(
    (count, group) =>
      count + (group.kind === 'terms' ? group.alternatives.length : 1),
    excluded.length,
  );
  if (words > MAX_TERMS) {
    throw new TooManyGroupsError();
  }
  return { raw, groups, excluded, isEmpty: raw.trim() === '' };
}
