import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'node:net';
import { ChatGateway } from 'src/chat/chat.gateway';
import { ChatService } from 'src/chat/core/chat.service';
import { SocketAuthService } from 'src/chat/socket-auth.service';
import { oidcFixture } from '../auth/oidc.fixture';

// Speak the Engine.IO + Socket.IO websocket protocol using ws, already present
// in the backend lockfile. No new socket.io-client dependency is required.
import { WebSocket } from 'ws';

class ChatClient {
  private messages: string[] = [];
  private listeners = new Set<() => void>();
  constructor(
    private ws: any,
    token: string,
  ) {
    ws.on('message', (data: Buffer) => {
      const message = data.toString();
      if (message.startsWith('0')) ws.send(`40${JSON.stringify({ token })}`);
      if (message === '2') ws.send('3');
      this.messages.push(message);
      for (const notify of this.listeners) notify();
    });
  }
  wait(prefix: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.listeners.delete(check);
        reject(new Error(`Timed out waiting for ${prefix}`));
      }, 3000);
      const check = () => {
        const index = this.messages.findIndex((m) => m.startsWith(prefix));
        if (index < 0) return;
        clearTimeout(timeout);
        this.listeners.delete(check);
        resolve(this.messages.splice(index, 1)[0]);
      };
      this.listeners.add(check);
      check();
    });
  }
  send(event: string, payload: unknown) {
    this.ws.send(`42${JSON.stringify([event, payload])}`);
  }
  async close() {
    if (this.ws.readyState === WebSocket.CLOSED) return;
    await new Promise<void>((resolve) => {
      this.ws.once('close', resolve);
      this.ws.close();
    });
  }
}

describe('Real chat handshake and expiry', () => {
  const oidc = oidcFixture();
  let app: INestApplication;
  let client: ChatClient;
  let chat: { saveMessage: jest.Mock; getTrackMessages: jest.Mock };
  const mode = process.env.KEYCLOAK_TOKEN_VALIDATION;
  let finishLookup: () => void;
  const alice = {
    id: 'alice',
    email: 'alice@example.test',
    firstName: 'Alice',
    lastName: 'Doe',
  };
  let lookupStarted: Promise<void>;
  beforeEach(async () => {
    process.env.KEYCLOAK_TOKEN_VALIDATION = 'OFFLINE';
    chat = {
      saveMessage: jest.fn().mockResolvedValue({ id: 'm1' }),
      getTrackMessages: jest.fn().mockResolvedValue([]),
    };
    let started: () => void;
    lookupStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const lookup = new Promise((resolve) => {
      finishLookup = () => resolve(alice);
    });
    const module = await Test.createTestingModule({
      providers: [
        ChatGateway,
        { provide: ChatService, useValue: chat },
        {
          provide: SocketAuthService,
          useValue: new SocketAuthService(oidc.keycloak),
        },
        {
          provide: 'UserGateway',
          useValue: {
            getUserByEmail: () => {
              started();
              return lookup;
            },
          },
        },
        { provide: 'TrackGateway', useValue: {} },
        { provide: 'EventGateway', useValue: {} },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
  });
  afterEach(async () => {
    finishLookup();
    jest.restoreAllMocks();
    if (client) await client.close();
    await app.close();
    if (mode === undefined) delete process.env.KEYCLOAK_TOKEN_VALIDATION;
    else process.env.KEYCLOAK_TOKEN_VALIDATION = mode;
  });
  it('waits for verified identity on the first write, then refuses writes at expiry', async () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const { port } = app.getHttpServer().address() as AddressInfo;
    client = new ChatClient(
      new WebSocket(
        `ws://127.0.0.1:${port}/socket.io/?EIO=4&transport=websocket`,
      ),
      oidc.token({ email: alice.email, exp }),
    );
    await client.wait('40');
    await lookupStarted;
    client.send('joinTrackRoom', { trackId: 't1', username: 'Fake' });
    await client.wait('42["messageHistory"');
    client.send('sendMessage', {
      trackId: 't1',
      userId: 'victim',
      username: 'Fake',
      message: 'hello',
    });
    // This round trip ensures sendMessage reached the server while identity
    // lookup was still pending, rather than accidentally testing after auth.
    client.send('joinTrackRoom', { trackId: 't1' });
    await client.wait('42["messageHistory"');
    expect(chat.saveMessage).not.toHaveBeenCalled();
    finishLookup();
    const posted = await client.wait('42["receiveMessage"');
    expect(JSON.parse(posted.slice(2))[1]).toMatchObject({
      userId: 'alice',
      username: 'Alice Doe',
    });
    expect(chat.saveMessage).toHaveBeenCalledTimes(1);
    jest.spyOn(Date, 'now').mockReturnValue(exp * 1000);
    client.send('sendMessage', {
      trackId: 't1',
      userId: 'victim',
      message: 'too late',
    });
    await client.wait('42["error"');
    // Barrier on the same transport proves the expired write has been handled.
    client.send('joinTrackRoom', { trackId: 't1' });
    await client.wait('42["messageHistory"');
    expect(chat.saveMessage).toHaveBeenCalledTimes(1);
  });
});
