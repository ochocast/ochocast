import { EventGateway } from 'src/events/infra/gateways/event.gateway';
import { EventObject } from 'src/events/domain/event';
import { TagEntity } from 'src/tags/infra/gateways/entities/tag.entity';

// POST /api/events (any signed-in user) and PUT /api/events/:id (the owner)
// pass the client's tag list to the gateway.
describe('Event tags are stored tags or new ones, never client objects', () => {
  const TAG_ID = '0b6f3c1e-5d2a-4f8b-9c7e-1a2b3c4d5e6f';
  let tags: Map<string, any>;
  let saved: any[];
  const tagsRepository = {
    // Like Postgres on the uuid primary key: an id that is not a uuid is an
    // error (22P02), not a miss.
    findOneBy: async ({ id }: any) => {
      if (
        typeof id !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          id,
        )
      ) {
        throw new Error(`invalid input syntax for type uuid: "${id}"`);
      }
      return tags.get(id) ?? null;
    },
    createQueryBuilder: () => {
      let name = '';
      const query = {
        where: (_sql: string, params: { name: string }) => {
          name = params.name;
          return query;
        },
        getOne: async () =>
          [...tags.values()].find(
            (tag) => tag.name.toLowerCase() === name.toLowerCase(),
          ) ?? null,
      };
      return query;
    },
    save: async (tag: any) => {
      const created = { ...tag, id: tag.id ?? `tag-${tags.size + 1}` };
      tags.set(created.id, created);
      return created;
    },
  };
  const gateway = () =>
    new EventGateway(
      {
        manager: {
          getRepository: (entity: unknown) =>
            entity === TagEntity ? tagsRepository : undefined,
        },
        save: async (event: any) => {
          saved.push(event);
          return event;
        },
        findOne: async () => ({ id: 'event', name: 'Stored', tags: [] }),
      } as any,
      { findOneBy: async ({ id }: any) => ({ id }) } as any,
    );
  const event = (tagList: unknown) =>
    new EventObject(
      'event',
      'Name',
      'Description',
      tagList as TagEntity[],
      new Date('2026-11-01T09:00:00.000Z'),
      new Date('2026-11-01T18:00:00.000Z'),
      false,
      true,
      false,
      'imageSlug',
      [],
      'owner',
      new Date('2026-10-19T08:00:00.000Z'),
      undefined,
      [],
    );
  // A shared tag renamed or linked to another user's video, a forged date,
  // and an id that matches no tag.
  const forged = [
    { id: TAG_ID, name: 'Renamed', videos: [{ id: 'another-video' }] },
    {
      name: '  Fresh ',
      videos: [{ id: 'another-video' }],
      createdAt: '2000-01-01T00:00:00.000Z',
    },
    { id: '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a' },
  ];
  const expectResolved = (savedTags: any[]) => {
    expect(savedTags).toHaveLength(2);
    expect(savedTags[0]).toBe(tags.get(TAG_ID));
    expect(tags.get(TAG_ID).name).toBe('Tag');
    expect(savedTags[1]).toMatchObject({ name: 'Fresh' });
    expect(savedTags[1].createdAt).not.toEqual('2000-01-01T00:00:00.000Z');
    for (const tag of savedTags) expect(tag.videos).toBeUndefined();
  };

  beforeEach(() => {
    saved = [];
    tags = new Map([
      [
        TAG_ID,
        {
          id: TAG_ID,
          name: 'Tag',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
    ]);
  });

  it('creating an event resolves its tags', async () => {
    await gateway().createNewEvent(event(forged));

    expectResolved(saved[0].tags);
  });

  it('updating an event resolves its tags', async () => {
    await gateway().updateEvent(event(forged));

    expectResolved(saved[0].tags);
  });

  const writes: [string, (tagList: unknown) => Promise<unknown>][] = [
    ['creating', (tagList) => gateway().createNewEvent(event(tagList))],
    ['updating', (tagList) => gateway().updateEvent(event(tagList))],
  ];

  // The use cases parse and cap the form's list (parseTagList): a raw string
  // here would skip that check.
  it.each(writes)(
    '%s an event refuses a list the caller did not parse, before creating any tag',
    async (_, write) => {
      await expect(write(JSON.stringify(forged))).rejects.toThrow();

      expect(saved).toHaveLength(0);
      expect([...tags.keys()]).toEqual([TAG_ID]);
    },
  );

  // A client id reached the uuid primary key as is: Postgres refused it and
  // the request failed with a 500.
  it.each(writes)(
    '%s an event skips ids that are not uuids',
    async (_, write) => {
      await write([
        { id: 'not-a-uuid' },
        { id: 42 },
        { id: `${TAG_ID}' OR '1'='1`, name: 'tag' },
      ]);

      expect(saved[0].tags).toEqual([tags.get(TAG_ID)]);
      expect([...tags.keys()]).toEqual([TAG_ID]);
    },
  );

  // Names are a unique varchar: past about 2.7 KB, Postgres cannot index the
  // name and the request failed with a 500.
  it.each(writes)(
    '%s an event drops tag names over 100 characters',
    async (_, write) => {
      const longest = 'b'.repeat(100);
      await write([{ name: 'a'.repeat(101) }, { name: ` ${longest} ` }]);

      expect(saved[0].tags).toEqual([
        expect.objectContaining({ name: longest }),
      ]);
      expect(tags.size).toBe(2);
    },
  );
});
