import {
  ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import { SearchVideosUsecase } from '../../domain/usecases/search-videos.usecase';
import { SearchController } from './search.controller';
import { SearchQueryDto } from './search-query.dto';

const pipe = new ValidationPipe({ transform: true });
const metadata: ArgumentMetadata = {
  type: 'query',
  metatype: SearchQueryDto,
};

const parse = (query: Record<string, unknown>): Promise<SearchQueryDto> =>
  pipe.transform(query, metadata);

describe('SearchQueryDto (through ValidationPipe)', () => {
  it('applies the defaults', async () => {
    const dto = await parse({});
    expect(dto).toMatchObject({
      favoris: false,
      archived: false,
      sort: 'relevance',
      limit: 20,
      offset: 0,
    });
    expect(dto.q).toBeUndefined();
    expect(dto.tags).toBeUndefined();
  });

  it('splits comma-separated tags and users, trimmed, without empties', async () => {
    const dto = await parse({ tags: 'a,b', users: ' demo , ,alice,' });
    expect(dto.tags).toEqual(['a', 'b']);
    expect(dto.users).toEqual(['demo', 'alice']);
  });

  it('turns an empty tags parameter into an empty list', async () => {
    expect((await parse({ tags: '' })).tags).toEqual([]);
  });

  it('joins then splits a repeated parameter', async () => {
    const dto = await parse({ tags: ['a,b', 'c'] });
    expect(dto.tags).toEqual(['a', 'b', 'c']);
  });

  it('converts the numbers and the booleans', async () => {
    const dto = await parse({
      limit: '50',
      offset: '7',
      favoris: 'true',
      archived: 'false',
      sort: 'recent',
      dateFrom: '2024-01-01T00:00:00.000Z',
      dateTo: '2024-02-01',
    });
    expect(dto).toMatchObject({
      limit: 50,
      offset: 7,
      favoris: true,
      archived: false,
      sort: 'recent',
      dateFrom: '2024-01-01T00:00:00.000Z',
      dateTo: '2024-02-01',
    });
  });

  it('keeps a long query for the parser to reject', async () => {
    expect((await parse({ q: 'a'.repeat(500) })).q).toHaveLength(500);
  });

  it.each([
    ['limit=0', { limit: '0' }],
    ['limit=51', { limit: '51' }],
    ['limit=abc', { limit: 'abc' }],
    ['limit=1.5', { limit: '1.5' }],
    ['offset=-1', { offset: '-1' }],
    ['offset=abc', { offset: 'abc' }],
    ['sort=foo', { sort: 'foo' }],
    ['an invalid dateFrom', { dateFrom: 'not-a-date' }],
    ['an impossible dateTo', { dateTo: '2024-02-31' }],
    ['favoris=yes', { favoris: 'yes' }],
    ['archived=1', { archived: '1' }],
    ['a repeated q', { q: ['a', 'b'] }],
    ['tags as an object', { tags: { a: 'b' } }],
  ])('rejects %s with 400', async (_label, query) => {
    await expect(parse(query)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('SearchController', () => {
  it('delegates to the use case with the current user e-mail', async () => {
    const result = { query: '', total: 0, passageTotal: 0, videos: [] };
    const usecase = { execute: jest.fn().mockResolvedValue(result) };
    const controller = new SearchController(
      usecase as unknown as SearchVideosUsecase,
    );
    const dto = new SearchQueryDto();

    await expect(controller.search(dto, 'a@b.c')).resolves.toBe(result);
    expect(usecase.execute).toHaveBeenCalledWith(dto, 'a@b.c');
  });
});
