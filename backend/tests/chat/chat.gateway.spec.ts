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

  const socket = () => {
    const errors: unknown[] = [];
    return {
      id: 'socket',
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
        trackId: 'track-1',
        userId: alice.id,
      })),
      deleteMessage: jest.fn(),
      addReaction: jest.fn(),
    } as unknown as jest.Mocked<ChatService>;
    const auth = {
      emailFromToken: jest.fn(
        async (t?: string) => (t ? tokens[t] : null) ?? null,
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
    const events = {
      getEventById: jest.fn(async () => ({ canBeEditBy: () => false })),
    } as unknown as IEventGateway;
    gateway = new ChatGateway(chatService, auth, users, tracks, events);
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
        trackId: 'track-1',
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
      { trackId: 'track-1', message: 'hi' } as never,
      client as never,
    );
    expect(chatService.saveMessage).not.toHaveBeenCalled();
    expect(client.errors).toHaveLength(1);
  });

  it('refuses an invalid token like no token', async () => {
    const client = await connect('forged-token');
    await gateway.handleMessage(
      { trackId: 'track-1', message: 'hi' } as never,
      client as never,
    );
    expect(chatService.saveMessage).not.toHaveBeenCalled();
  });

  it('does not let a user delete messages by claiming to be a speaker', async () => {
    const client = await connect('mallory-token');
    await gateway.handleDeleteMessage(
      {
        messageId: 'm1',
        trackId: 'track-1',
        userId: alice.id,
        isSpeaker: true,
      } as never,
      client as never,
    );
    expect(chatService.deleteMessage).not.toHaveBeenCalled();
  });

  it("lets the author and the track's speakers delete a message", async () => {
    await gateway.handleDeleteMessage(
      { messageId: 'm1', trackId: 'track-1' } as never,
      (await connect('alice-token')) as never,
    );
    await gateway.handleDeleteMessage(
      { messageId: 'm1', trackId: 'track-1' } as never,
      (await connect('speaker-token')) as never,
    );
    expect(chatService.deleteMessage).toHaveBeenCalledTimes(2);
  });

  it('records reactions under the signed-in user', async () => {
    await gateway.handleAddReaction(
      {
        messageId: 'm1',
        trackId: 'track-1',
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
});
