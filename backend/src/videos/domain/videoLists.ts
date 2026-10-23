import { BadRequestException } from '@nestjs/common';

/** Most tags, or internal speakers, a form may give a video. */
export const MAX_VIDEO_LIST_LENGTH = 100;

const parseList = (value: unknown): unknown =>
  typeof value === 'string' ? JSON.parse(value || '[]') : (value ?? []);

/**
 * The tags and internal speakers lists of an upload or edit form (JSON
 * strings, or arrays once parsed): arrays of at most 100 entries, or a 400.
 * Their entries are then resolved against stored rows by the video gateway.
 */
export function parseVideoLists(
  tags: unknown,
  speakers: unknown,
): { tags: unknown[]; speakers: unknown[] } {
  try {
    const parsed = { tags: parseList(tags), speakers: parseList(speakers) };
    if (
      Array.isArray(parsed.tags) &&
      Array.isArray(parsed.speakers) &&
      parsed.tags.length <= MAX_VIDEO_LIST_LENGTH &&
      parsed.speakers.length <= MAX_VIDEO_LIST_LENGTH
    )
      return parsed as { tags: unknown[]; speakers: unknown[] };
  } catch {
    // Malformed JSON: the same 400 as a wrong shape.
  }
  throw new BadRequestException('Invalid tags or speakers');
}
