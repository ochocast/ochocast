import { BadRequestException } from '@nestjs/common';

/** Most entries a form may send in one list (tags, internal speakers). */
export const MAX_FORM_LIST_LENGTH = 100;

/**
 * A list sent by a form, as a JSON string (multipart) or an array (JSON
 * body): an array of at most 100 entries, or null. A missing list is empty.
 */
export function parseFormList(value: unknown): unknown[] | null {
  try {
    const parsed: unknown =
      typeof value === 'string' ? JSON.parse(value || '[]') : (value ?? []);
    return Array.isArray(parsed) && parsed.length <= MAX_FORM_LIST_LENGTH
      ? parsed
      : null;
  } catch {
    // Malformed JSON: the same answer as a wrong shape.
    return null;
  }
}

/**
 * The tags of a form, or a 400. Their entries are resolved against stored
 * rows by the gateway, which creates the missing names.
 */
export function parseTagList(tags: unknown): unknown[] {
  const list = parseFormList(tags);
  if (!list) throw new BadRequestException('Invalid tags');
  return list;
}
