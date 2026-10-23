import { BadRequestException } from '@nestjs/common';
import { parseFormList } from 'src/common/formList';

/**
 * The tags and internal speakers lists of an upload or edit form (JSON
 * strings, or arrays once parsed): arrays of at most 100 entries, or a 400.
 * Their entries are then resolved against stored rows by the video gateway.
 */
export function parseVideoLists(
  tags: unknown,
  speakers: unknown,
): { tags: unknown[]; speakers: unknown[] } {
  const parsed = {
    tags: parseFormList(tags),
    speakers: parseFormList(speakers),
  };
  if (parsed.tags && parsed.speakers)
    return parsed as { tags: unknown[]; speakers: unknown[] };
  throw new BadRequestException('Invalid tags or speakers');
}
