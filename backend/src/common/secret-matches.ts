import { timingSafeEqual } from 'node:crypto';

/**
 * Constant-time comparison of a shared secret with a request header. Compares
 * bytes, not characters: a non-ASCII header of the same character length
 * must be refused, not make timingSafeEqual throw.
 */
export function secretMatches(secret: string, header: unknown): boolean {
  if (typeof header !== 'string') return false;
  const expected = Buffer.from(secret);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
