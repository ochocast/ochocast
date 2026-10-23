import { EntityManager } from 'typeorm';
import { TagEntity } from './entities/tag.entity';

/** A client tag entry: only its id and name are read. */
type RawTag = { id?: string; name?: unknown } | null | undefined;

/**
 * Stored tags for a client list, found by id or case-insensitive name, and
 * new ones created from a trimmed name only; unknown ids are dropped. A
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
    const tagId = rawTag?.id;
    const tagName = typeof rawTag?.name === 'string' ? rawTag.name.trim() : '';

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
