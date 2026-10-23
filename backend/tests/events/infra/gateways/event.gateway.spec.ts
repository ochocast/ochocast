import { EventGateway } from 'src/events/infra/gateways/event.gateway';
import { EventObject } from 'src/events/domain/event';
import { TagEntity } from 'src/tags/infra/gateways/entities/tag.entity';

// POST /api/events (any signed-in user) and PUT /api/events/:id (the owner)
// pass the client's tag list to the gateway.
describe('Event tags are stored tags or new ones, never client objects', () => {
  let tags: Map<string, any>;
  let saved: any[];
  const tagsRepository = {
    findOneBy: async ({ id }: any) => tags.get(id) ?? null,
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
    { id: 'tag', name: 'Renamed', videos: [{ id: 'another-video' }] },
    {
      name: '  Fresh ',
      videos: [{ id: 'another-video' }],
      createdAt: '2000-01-01T00:00:00.000Z',
    },
    { id: 'unknown-tag' },
  ];
  const expectResolved = (savedTags: any[]) => {
    expect(savedTags).toHaveLength(2);
    expect(savedTags[0]).toBe(tags.get('tag'));
    expect(tags.get('tag').name).toBe('Tag');
    expect(savedTags[1]).toMatchObject({ name: 'Fresh' });
    expect(savedTags[1].createdAt).not.toEqual('2000-01-01T00:00:00.000Z');
    for (const tag of savedTags) expect(tag.videos).toBeUndefined();
  };

  beforeEach(() => {
    saved = [];
    tags = new Map([
      [
        'tag',
        {
          id: 'tag',
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

  // The use cases parse and cap the form's list (parseTagList): a raw string
  // here would skip that check.
  it.each([
    [
      'creating',
      (tagList: unknown) => gateway().createNewEvent(event(tagList)),
    ],
    ['updating', (tagList: unknown) => gateway().updateEvent(event(tagList))],
  ])(
    '%s an event refuses a list the caller did not parse, before creating any tag',
    async (_, write) => {
      await expect(write(JSON.stringify(forged))).rejects.toThrow();

      expect(saved).toHaveLength(0);
      expect([...tags.keys()]).toEqual(['tag']);
    },
  );
});
