import { ChatGateway } from 'src/chat/chat.gateway';
import { SocketAuthService } from 'src/chat/socket-auth.service';
import { ChatService } from 'src/chat/core/chat.service';
import { UserObject } from 'src/users/domain/user';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { ITrackGateway } from 'src/tracks/domain/gateways/tracks.gateway';
import { IEventGateway } from 'src/events/domain/gateways/events.gateway';
import { oidcFixture } from '../auth/oidc.fixture';

const alice = {
  id: 'alice',
  email: 'alice@example.test',
  firstName: 'Alice',
  lastName: 'Doe',
} as UserObject;

describe('Connected chat socket expiry', () => {
  const oidc = oidcFixture();
  const validation = process.env.KEYCLOAK_TOKEN_VALIDATION;
  let gateway: ChatGateway;
  let chat: Record<string, jest.Mock>;
  let emitted: jest.Mock;
  let users: { getUserByEmail: jest.Mock };
  let client: any;
  let exp: number;
  beforeEach(() => {
    process.env.KEYCLOAK_TOKEN_VALIDATION = 'OFFLINE';
    exp = Math.floor(Date.now() / 1000) + 60;
    chat = {
      saveMessage: jest.fn().mockResolvedValue({ id: 'm1' }),
      getMessageById: jest
        .fn()
        .mockResolvedValue({ id: 'm1', userId: alice.id, trackId: 't1' }),
      updateMessage: jest.fn().mockResolvedValue({ message: 'edited' }),
      deleteMessage: jest.fn(),
      addReaction: jest.fn(),
      removeReaction: jest.fn(),
    };
    emitted = jest.fn();
    users = { getUserByEmail: jest.fn().mockResolvedValue(alice) };
    gateway = new ChatGateway(
      chat as unknown as ChatService,
      new SocketAuthService(oidc.keycloak),
      users as unknown as IUserGateway,
      {
        getTracks: jest.fn().mockResolvedValue([{ canBeEditBy: () => true }]),
      } as unknown as ITrackGateway,
      {} as IEventGateway,
    );
    gateway.server = { to: () => ({ emit: emitted }) } as never;
    client = {
      id: 'socket-1',
      connected: true,
      data: {},
      emit: jest.fn(),
      handshake: { auth: { token: oidc.token({ email: alice.email, exp }) } },
    };
  });
  afterEach(() => {
    jest.restoreAllMocks();
    if (validation === undefined) delete process.env.KEYCLOAK_TOKEN_VALIDATION;
    else process.env.KEYCLOAK_TOKEN_VALIDATION = validation;
  });
  const expire = () => jest.spyOn(Date, 'now').mockReturnValue(exp * 1000);

  it('accepts a pre-expiry message under the verified author', async () => {
    await gateway.handleConnection(client);
    await gateway.handleMessage(
      { trackId: 't1', message: 'hi', userId: 'victim' } as never,
      client,
    );
    expect(chat.saveMessage.mock.calls[0][0].userId).toBe('alice');
  });
  it.each([
    'send',
    'edit',
    'delete',
    'react',
    'unreact',
    'poll-create',
    'poll-answer',
    'poll-close',
  ])('denies %s at token expiry on an established socket', async (action) => {
    await gateway.handleConnection(client);
    expire();
    const data = {
      trackId: 't1',
      messageId: 'm1',
      userId: alice.id,
      isSpeaker: true,
      newContent: 'edit',
      emoji: '+',
      poll: { id: 'p1' },
      pollId: 'p1',
    };
    switch (action) {
      case 'send':
        await gateway.handleMessage(
          { ...data, message: 'hi' } as never,
          client,
        );
        break;
      case 'edit':
        await gateway.handleEditMessage(data, client);
        break;
      case 'delete':
        await gateway.handleDeleteMessage(data, client);
        break;
      case 'react':
        await gateway.handleAddReaction(data, client);
        break;
      case 'unreact':
        await gateway.handleRemoveReaction(data, client);
        break;
      case 'poll-create':
        await gateway.handlePollCreated(data, client);
        break;
      case 'poll-answer':
        await gateway.handlePollAnswered(data, client);
        break;
      case 'poll-close':
        await gateway.handlePollClosed(data, client);
        break;
    }
    for (const operation of Object.values(chat))
      expect(operation).not.toHaveBeenCalled();
    expect(emitted).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith('error', expect.any(Object));
  });
  it('rechecks expiry after awaiting message ownership before mutation', async () => {
    await gateway.handleConnection(client);
    chat.getMessageById.mockImplementation(async () => {
      expire();
      return { id: 'm1', userId: alice.id, trackId: 't1' };
    });
    await gateway.handleDeleteMessage(
      { trackId: 't1', messageId: 'm1', userId: alice.id, isSpeaker: false },
      client,
    );
    expect(chat.deleteMessage).not.toHaveBeenCalled();
  });
  it('cleans the authenticated identity on disconnect', async () => {
    await gateway.handleConnection(client);
    client.connected = false;
    gateway.handleDisconnect(client);
    await gateway.handleMessage(
      { trackId: 't1', message: 'late' } as never,
      client,
    );
    expect(chat.saveMessage).not.toHaveBeenCalled();
    expect(client.data.user).toBeUndefined();
  });
  it('does not resurrect authorization when validation finishes after disconnect', async () => {
    let finish: (user: UserObject) => void;
    const pending = new Promise<UserObject>((resolve) => {
      finish = resolve;
    });
    users.getUserByEmail.mockReturnValue(pending);
    const connection = gateway.handleConnection(client);
    client.connected = false;
    gateway.handleDisconnect(client);
    finish(alice);
    await connection;
    expect(client.data.user).toBeUndefined();
  });
});
