import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { SearchGateway } from '../gateways/search.gateway';
import { TranscriptResult } from '../search.types';
import { GetTranscriptUsecase } from './get-transcript.usecase';

const VIDEO_ID = '6f1d0f1e-0000-4000-8000-000000000001';
const RESULT: TranscriptResult = {
  videoId: VIDEO_ID,
  source: 'auto',
  status: 'ready',
  segments: [],
  matches: [],
};

describe('GetTranscriptUsecase', () => {
  let gateway: { search: jest.Mock; transcript: jest.Mock };
  let users: { getUserByEmail: jest.Mock };
  let usecase: GetTranscriptUsecase;

  beforeEach(() => {
    gateway = {
      search: jest.fn(),
      transcript: jest.fn().mockResolvedValue(RESULT),
    };
    users = {
      getUserByEmail: jest
        .fn()
        .mockResolvedValue({ id: 'user-1', role: 'user' }),
    };
    usecase = new GetTranscriptUsecase(
      gateway as unknown as SearchGateway,
      users as unknown as IUserGateway,
    );
  });

  it('returns the transcript of the gateway for the viewer', async () => {
    await expect(
      usecase.execute(VIDEO_ID, 'kubernetes', 'a@b.c'),
    ).resolves.toBe(RESULT);

    expect(users.getUserByEmail).toHaveBeenCalledWith('a@b.c');
    const [videoId, parsed, viewer] = gateway.transcript.mock.calls[0];
    expect(videoId).toBe(VIDEO_ID);
    expect(parsed.raw).toBe('kubernetes');
    expect(viewer).toEqual({ userId: 'user-1', isAdmin: false });
  });

  it('passes isAdmin true for role admin', async () => {
    users.getUserByEmail.mockResolvedValue({ id: 'admin-1', role: 'admin' });

    await usecase.execute(VIDEO_ID, undefined, 'a@b.c');

    expect(gateway.transcript.mock.calls[0][2]).toEqual({
      userId: 'admin-1',
      isAdmin: true,
    });
  });

  it.each([undefined, '', '   '])('passes a null query for q %p', async (q) => {
    await usecase.execute(VIDEO_ID, q, 'a@b.c');
    expect(gateway.transcript.mock.calls[0][1]).toBeNull();
  });

  it('keeps a query made only of exclusions, for the gateway to ignore', async () => {
    await usecase.execute(VIDEO_ID, '-pod', 'a@b.c');
    expect(gateway.transcript.mock.calls[0][1]).toMatchObject({
      groups: [],
      excluded: ['pod'],
    });
  });

  it('answers 404 when the gateway returns null', async () => {
    gateway.transcript.mockResolvedValue(null);
    await expect(
      usecase.execute(VIDEO_ID, 'kubernetes', 'a@b.c'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('answers 400 for a query of 201 characters', async () => {
    const error = await usecase
      .execute(VIDEO_ID, 'a'.repeat(201), 'a@b.c')
      .catch((e) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.message).toContain('200');
    expect(gateway.transcript).not.toHaveBeenCalled();
  });

  it('answers 400 for more than 10 groups', async () => {
    const q = Array.from({ length: 11 }, (_, i) => `mot${i}`).join(' ');
    await expect(usecase.execute(VIDEO_ID, q, 'a@b.c')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(gateway.transcript).not.toHaveBeenCalled();
  });

  it.each([undefined, ''])('answers 403 for the e-mail %p', async (email) => {
    await expect(
      usecase.execute(VIDEO_ID, 'a', email as string),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(users.getUserByEmail).not.toHaveBeenCalled();
    expect(gateway.transcript).not.toHaveBeenCalled();
  });

  it('answers 403 for an unknown user', async () => {
    users.getUserByEmail.mockResolvedValue(null);
    await expect(
      usecase.execute(VIDEO_ID, 'a', 'a@b.c'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(gateway.transcript).not.toHaveBeenCalled();
  });

  it('rethrows any other error', async () => {
    const failure = new Error('boom');
    gateway.transcript.mockRejectedValue(failure);
    await expect(usecase.execute(VIDEO_ID, 'a', 'a@b.c')).rejects.toBe(failure);
  });
});
