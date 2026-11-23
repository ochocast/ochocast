import { ChatGateway } from 'src/chat/chat.gateway';
import { ChatService } from 'src/chat/core/chat.service';
import { SocketAuthService } from 'src/chat/socket-auth.service';
import { IEventGateway } from 'src/events/domain/gateways/events.gateway';
import { ITrackGateway } from 'src/tracks/domain/gateways/tracks.gateway';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { UserObject } from 'src/users/domain/user';

const user = (id: string, email: string, firstName: string) =>
  ({ id, email, firstName, lastName: 'Doe', username: id }) as UserObject;

describe('ChatGateway authorization', () => {
  const alice = user('alice', 'alice@example.com', 'Alice');
  const mallory = user('mallory', 'mallory@example.com', 'Mallory');
  const speaker = user('speaker', 'speaker@example.com', 'Sam');
  const tokens: Record<string, string> = {
    'alice-token': alice.email,
    'mallory-token': mallory.email,
    'speaker-token': speaker.email,
  };

  let gateway: ChatGateway;
  let chatService: jest.Mocked<ChatService>;
  let emitted: { room: string; event: string; payload: unknown }[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let events: any;
  const TRACK = '3f2a8c1e-5b7d-4e9a-8c6f-1d2e3f4a5b6c';
  const unpublished = () =>
    events.getEventById.mockResolvedValue({
      published: false,
      canBeEditBy: () => false,
      canBeReadBy: (u: UserObject) => u.id === speaker.id,
    });

  const socket = () => {
    const errors: unknown[] = [];
    return {
      id: 'socket',
      connected: true,
      data: {} as Record<string, unknown>,
      handshake: { auth: {} as Record<string, string> },
      errors,
      emit: jest.fn((event: string, payload: unknown) => {
        if (event === 'error') errors.push(payload);
      }),
      join: jest.fn(),
      to: jest.fn(() => ({ emit: jest.fn() })),
    };
  };
  const connect = async (token?: string) => {
    const client = socket();
    if (token) client.handshake.auth.token = token;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await gateway.handleConnection(client as any);
    return client;
  };

  beforeEach(() => {
    emitted = [];
    chatService = {
      saveMessage: jest.fn(async () => ({ id: 'm1' })),
      getMessageById: jest.fn(async () => ({
        id: 'm1',
        trackId: '3f2a8c1e-5b7d-4e9a-8c6f-1d2e3f4a5b6c',
        userId: alice.id,
      })),
      deleteMessage: jest.fn(),
      addReaction: jest.fn(),
      getTrackMessages: jest.fn(async () => []),
      updateMessage: jest.fn(async () => ({
        message: 'edited',
        editedAt: new Date(),
      })),
    } as unknown as jest.Mocked<ChatService>;
    const auth = {
      identityFromToken: jest.fn(async (t?: string) =>
        t && tokens[t]
          ? { email: tokens[t], expiresAt: Date.now() + 60000 }
          : null,
      ),
    } as unknown as SocketAuthService;
    const users = {
      getUserByEmail: jest.fn(async (email: string) =>
        [alice, mallory, speaker].find((u) => u.email === email),
      ),
    } as unknown as IUserGateway;
    const tracks = {
      getTracks: jest.fn(async () => [
        { eventId: 'e1', canBeEditBy: (u: UserObject) => u.id === speaker.id },
      ]),
    } as unknown as ITrackGateway;
    events = {
      getEventById: jest.fn(async () => ({
        published: true,
        canBeEditBy: () => false,
        canBeReadBy: () => true,
      })),
    };
    gateway = new ChatGateway(
      chatService,
      auth,
      users,
      tracks,
      events as IEventGateway,
    );
    gateway.server = {
      to: (room: string) => ({
        emit: (event: string, payload: unknown) =>
          emitted.push({ room, event, payload }),
      }),
    } as never;
  });

  it('takes the author from the token, not from the message', async () => {
    const client = await connect('mallory-token');
    await gateway.handleMessage(
      {
        trackId: '3f2a8c1e-5b7d-4e9a-8c6f-1d2e3f4a5b6c',
        userId: alice.id,
        username: 'Alice Doe',
        message: 'hi',
      } as never,
      client as never,
    );
    const sent = emitted.find((e) => e.event === 'receiveMessage')?.payload as {
      userId: string;
      username: string;
    };
    expect(sent.userId).toBe(mallory.id);
    expect(sent.username).toBe('Mallory Doe');
  });

  it('lets anonymous sockets read but not post', async () => {
    const client = await connect();
    await gateway.handleMessage(
      {
        trackId: '3f2a8c1e-5b7d-4e9a-8c6f-1d2e3f4a5b6c',
        message: 'hi',
      } as never,
      client as never,
    );
    expect(chatService.saveMessage).not.toHaveBeenCalled();
    expect(client.errors).toHaveLength(1);
  });

  it('refuses an invalid token like no token', async () => {
    const client = await connect('forged-token');
    await gateway.handleMessage(
      {
        trackId: '3f2a8c1e-5b7d-4e9a-8c6f-1d2e3f4a5b6c',
        message: 'hi',
      } as never,
      client as never,
    );
    expect(chatService.saveMessage).not.toHaveBeenCalled();
  });

  it('does not let a user delete messages by claiming to be a speaker', async () => {
    const client = await connect('mallory-token');
    await gateway.handleDeleteMessage(
      {
        messageId: 'm1',
        trackId: '3f2a8c1e-5b7d-4e9a-8c6f-1d2e3f4a5b6c',
        userId: alice.id,
        isSpeaker: true,
      } as never,
      client as never,
    );
    expect(chatService.deleteMessage).not.toHaveBeenCalled();
  });

  it("lets the author and the track's speakers delete a message", async () => {
    await gateway.handleDeleteMessage(
      {
        messageId: 'm1',
        trackId: '3f2a8c1e-5b7d-4e9a-8c6f-1d2e3f4a5b6c',
      } as never,
      (await connect('alice-token')) as never,
    );
    await gateway.handleDeleteMessage(
      {
        messageId: 'm1',
        trackId: '3f2a8c1e-5b7d-4e9a-8c6f-1d2e3f4a5b6c',
      } as never,
      (await connect('speaker-token')) as never,
    );
    expect(chatService.deleteMessage).toHaveBeenCalledTimes(2);
  });

  it('records reactions under the signed-in user', async () => {
    await gateway.handleAddReaction(
      {
        messageId: 'm1',
        trackId: '3f2a8c1e-5b7d-4e9a-8c6f-1d2e3f4a5b6c',
        userId: alice.id,
        emoji: '👍',
      } as never,
      (await connect('mallory-token')) as never,
    );
    expect(chatService.addReaction).toHaveBeenCalledWith(
      'm1',
      mallory.id,
      '👍',
    );
  });

  it('opens an unpublished event chat to anyone with the link', async () => {
    unpublished();
    for (const client of [await connect('mallory-token'), await connect()]) {
      await gateway.handleJoinRoom(
        { trackId: TRACK } as never,
        client as never,
      );
      expect(client.join).toHaveBeenCalledWith(TRACK);
    }
  });

  it('refuses the chat of a track that does not exist', async () => {
    const client = await connect('mallory-token');
    await gateway.handleJoinRoom(
      { trackId: 'not-a-track' } as never,
      client as never,
    );
    expect(client.join).not.toHaveBeenCalled();
    expect(client.errors).toHaveLength(1);
    await gateway.handleMessage(
      { trackId: 'not-a-track', message: 'hi' } as never,
      client as never,
    );
    expect(chatService.saveMessage).not.toHaveBeenCalled();
  });

  it('refuses reactions on messages whose track is gone', async () => {
    events.getEventById.mockResolvedValue(null);
    const client = await connect('mallory-token');
    await gateway.handleAddReaction(
      { messageId: 'm1', trackId: 'any-room', emoji: '👍' } as never,
      client as never,
    );
    expect(chatService.addReaction).not.toHaveBeenCalled();
    expect(emitted).toHaveLength(0);
  });

  it("announces edits and reactions in the message's own room", async () => {
    const author = await connect('alice-token');
    await gateway.handleEditMessage(
      { messageId: 'm1', trackId: 'another-room', newContent: 'x' } as never,
      author as never,
    );
    await gateway.handleAddReaction(
      { messageId: 'm1', trackId: 'another-room', emoji: '👍' } as never,
      author as never,
    );
    expect(emitted.map((e) => e.room)).toEqual([TRACK, TRACK]);
  });

  it('follows a renewed token on the open socket, and signs out on an empty one', async () => {
    const client = await connect();
    expect(
      await gateway.handleAuthenticate(
        { token: 'alice-token' },
        client as never,
      ),
    ).toEqual({ signedIn: true });
    await gateway.handleMessage(
      { trackId: TRACK, message: 'hi' } as never,
      client as never,
    );
    expect(chatService.saveMessage).toHaveBeenCalledWith(
      expect.objectContaining({ userId: alice.id }),
    );
    expect(await gateway.handleAuthenticate({}, client as never)).toEqual({
      signedIn: false,
    });
  });
});
