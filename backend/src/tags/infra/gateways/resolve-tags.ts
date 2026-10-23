import { isUUID } from 'class-validator';
import { EntityManager } from 'typeorm';
import { TagEntity } from './entities/tag.entity';

/**
 * Longest tag name created from a client list, in UTF-16 code units (at most
 * 300 bytes in UTF-8). The name is a unique varchar: Postgres cannot index an
 * entry over about 2.7 KB and the insert failed with a 500.
 */
export const MAX_TAG_NAME_LENGTH = 100;

/** A client tag entry: only its id and name are read. */
type RawTag = { id?: unknown; name?: unknown } | null | undefined;

/**
 * Stored tags for a client list, found by id or case-insensitive name, and
 * new ones created from a trimmed name only. Ids that are not uuids, unknown
 * ids and names over `MAX_TAG_NAME_LENGTH` are dropped. A
 * client object never reaches a save: through a cascade, or the tag's
 * inverse relation to videos, it would rename a shared tag or rewrite other
 * videos' links.
 *
 * The list comes parsed and capped by the use case (`parseTagList`,
 * `parseVideoLists`): a raw form string is refused, not parsed here.
 */
export async function resolveTags(
  manager: EntityManager,
  list: readonly RawTag[] | null | undefined,
): Promise<TagEntity[]> {
  if (list != null && !Array.isArray(list)) {
    throw new Error('Tags must be parsed and capped before they are resolved');
  }
  const tagsRepository = manager.getRepository(TagEntity);
  const uniqueTags = new Map<string, TagEntity>();
  for (const rawTag of list ?? []) {
    // Postgres refuses an id that is not a uuid (22P02) instead of missing it.
    const tagId = isUUID(rawTag?.id) ? (rawTag?.id as string) : null;
    const trimmed = typeof rawTag?.name === 'string' ? rawTag.name.trim() : '';
    const tagName = trimmed.length <= MAX_TAG_NAME_LENGTH ? trimmed : '';

    let resolvedTag: TagEntity | null = null;

    if (tagId) {
      resolvedTag = await tagsRepository.findOneBy({ id: tagId });
    }

    if (!resolvedTag && tagName) {
      resolvedTag = await tagsRepository
        .createQueryBuilder('tag')
        .where('LOWER(tag.name) = LOWER(:name)', { name: tagName })
        .getOne();
    }

    if (!resolvedTag && tagName) {
      resolvedTag = await tagsRepository.save(
        new TagEntity({
          name: tagName,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );
    }

    if (resolvedTag) {
      uniqueTags.set(resolvedTag.id, resolvedTag);
    }
  }
  return Array.from(uniqueTags.values());
}
