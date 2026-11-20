import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { SearchQueryDto } from '../../infra/controllers/search-query.dto';
import { SearchGateway } from '../gateways/search.gateway';
import { SearchResult } from '../search.types';
import { SearchVideosUsecase } from './search-videos.usecase';

const EMPTY_RESULT: SearchResult = {
  query: 'kubernetes',
  total: 0,
  passageTotal: 0,
  videos: [],
};

function dto(values: Partial<SearchQueryDto> = {}): SearchQueryDto {
  return Object.assign(new SearchQueryDto(), values);
}

describe('SearchVideosUsecase', () => {
  let gateway: { search: jest.Mock; transcript: jest.Mock };
  let users: { getUserByEmail: jest.Mock };
  let usecase: SearchVideosUsecase;

  beforeEach(() => {
    gateway = {
      search: jest.fn().mockResolvedValue(EMPTY_RESULT),
      transcript: jest.fn(),
    };
    users = {
      getUserByEmail: jest
        .fn()
        .mockResolvedValue({ id: 'user-1', role: 'user' }),
    };
    usecase = new SearchVideosUsecase(
      gateway as unknown as SearchGateway,
      users as unknown as IUserGateway,
    );
  });

  it('searches with the defaults of the DTO and returns the gateway result', async () => {
    const result = await usecase.execute(dto({ q: 'kubernetes' }), 'a@b.c');

    expect(result).toBe(EMPTY_RESULT);
    expect(users.getUserByEmail).toHaveBeenCalledWith('a@b.c');
    const [parsed, filters, page, viewer] = gateway.search.mock.calls[0];
    expect(parsed.raw).toBe('kubernetes');
    expect(filters).toEqual({
      tags: [],
      users: [],
      dateFrom: undefined,
      dateTo: undefined,
      favoris: false,
      archived: false,
    });
    expect(page).toEqual({ limit: 20, offset: 0, sort: 'relevance' });
    expect(viewer).toEqual({ userId: 'user-1', isAdmin: false });
  });

  it('passes the filters, the dates as Date and the page of the DTO', async () => {
    await usecase.execute(
      dto({
        tags: ['a', 'b'],
        users: ['demo'],
        dateFrom: '2024-01-01T00:00:00.000Z',
        dateTo: '2024-02-01T00:00:00.000Z',
        favoris: true,
        sort: 'recent',
        limit: 5,
        offset: 10,
      }),
      'a@b.c',
    );

    const [parsed, filters, page] = gateway.search.mock.calls[0];
    expect(parsed.isEmpty).toBe(true);
    expect(filters.tags).toEqual(['a', 'b']);
    expect(filters.users).toEqual(['demo']);
    expect(filters.dateFrom).toEqual(new Date('2024-01-01T00:00:00.000Z'));
    expect(filters.dateTo).toEqual(new Date('2024-02-01T00:00:00.000Z'));
    expect(filters.favoris).toBe(true);
    expect(page).toEqual({ limit: 5, offset: 10, sort: 'recent' });
  });

  it('passes isAdmin true for role admin', async () => {
    users.getUserByEmail.mockResolvedValue({ id: 'admin-1', role: 'admin' });

    await usecase.execute(dto({ archived: true }), 'a@b.c');

    const [, filters, , viewer] = gateway.search.mock.calls[0];
    expect(viewer).toEqual({ userId: 'admin-1', isAdmin: true });
    expect(filters.archived).toBe(true);
  });

  it('rejects archived=true for a non-admin with 403', async () => {
    await expect(
      usecase.execute(dto({ archived: true }), 'a@b.c'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(gateway.search).not.toHaveBeenCalled();
  });

  it.each([undefined, ''])('rejects the e-mail %p with 403', async (email) => {
    await expect(
      usecase.execute(dto({ q: 'a' }), email as string),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(users.getUserByEmail).not.toHaveBeenCalled();
  });

  it('rejects an unknown user with 403', async () => {
    users.getUserByEmail.mockResolvedValue(null);
    await expect(
      usecase.execute(dto({ q: 'a' }), 'a@b.c'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(gateway.search).not.toHaveBeenCalled();
  });

  it('maps a too long query to 400', async () => {
    const error = await usecase
      .execute(dto({ q: 'a'.repeat(201) }), 'a@b.c')
      .catch((e) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.message).toContain('200');
    expect(gateway.search).not.toHaveBeenCalled();
  });

  it('maps too many groups to 400', async () => {
    const q = Array.from({ length: 11 }, (_, i) => `mot${i}`).join(' ');
    await expect(usecase.execute(dto({ q }), 'a@b.c')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(gateway.search).not.toHaveBeenCalled();
  });

  it('maps a statement timeout to 503', async () => {
    gateway.search.mockRejectedValue(
      Object.assign(new Error('canceling statement due to statement timeout'), {
        code: '57014',
      }),
    );
    const error = await usecase
      .execute(dto({ q: 'kubernetes' }), 'a@b.c')
      .catch((e) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error.message).not.toMatch(/statement|canceling|timeout/i);
  });

  it('rethrows any other error', async () => {
    const failure = Object.assign(new Error('boom'), { code: '42P01' });
    gateway.search.mockRejectedValue(failure);
    await expect(
      usecase.execute(dto({ q: 'kubernetes' }), 'a@b.c'),
    ).rejects.toBe(failure);
  });
});
