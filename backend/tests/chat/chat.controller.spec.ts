import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChatController } from 'src/chat/chat.controller';
import { UserObject } from 'src/users/domain/user';

const TRACK = '3f2a8c1e-5b7d-4e9a-8c6f-1d2e3f4a5b6c';
const user = (id: string) => ({ id, email: `${id}@example.com` }) as UserObject;

describe('ChatController access', () => {
  const author = user('author');
  const speaker = user('speaker');
  const stranger = user('stranger');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let chat: any;
  let published: boolean;
  let controller: ChatController;

  beforeEach(() => {
    published = true;
    chat = {
      getTrackMessages: jest.fn(async () => []),
      clearTrackMessages: jest.fn(),
      deleteMessage: jest.fn(),
      getMessageById: jest.fn(async () => ({
        id: 'm1',
        trackId: TRACK,
        userId: author.id,
      })),
    };
    const users = {
      getUserByEmail: jest.fn(async (email: string) =>
        [author, speaker, stranger].find((u) => u.email === email),
      ),
    };
    const tracks = {
      getTracks: jest.fn(async () => [
        { eventId: 'e1', canBeEditBy: (u: UserObject) => u.id === speaker.id },
      ]),
    };
    const events = {
      getEventById: jest.fn(async () => ({
        published,
        canBeEditBy: () => false,
        canBeReadBy: (u: UserObject) => u.id === speaker.id,
      })),
    };
    controller = new ChatController(
      chat,
      {} as never,
      users as never,
      tracks as never,
      events as never,
    );
  });

  it('shows the messages of any existing track, unpublished or not', async () => {
    published = false;
    await expect(controller.getTrackMessages(TRACK)).resolves.toEqual([]);
    await expect(
      controller.getTrackMessages('not-a-track'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lets only speakers clear a chat', async () => {
    await expect(
      controller.clearTrackMessages(TRACK, stranger.email),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await controller.clearTrackMessages(TRACK, speaker.email);
    expect(chat.clearTrackMessages).toHaveBeenCalledTimes(1);
  });

  it('lets the author or a speaker delete a message, nobody else', async () => {
    await expect(
      controller.deleteMessage('m1', stranger.email),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.deleteMessage('m1', undefined),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await controller.deleteMessage('m1', author.email);
    await controller.deleteMessage('m1', speaker.email);
    expect(chat.deleteMessage).toHaveBeenCalledTimes(2);
  });
});
