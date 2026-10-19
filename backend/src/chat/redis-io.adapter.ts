import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { ServerOptions } from 'socket.io';

// Shares chat rooms between backend replicas through Redis (REDIS_URL). Without it, a
// message only reaches the clients connected to the same replica.
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor: ReturnType<typeof createAdapter>;

  constructor(
    app: INestApplicationContext,
    private readonly url: string,
  ) {
    super(app);
  }

  async connect(): Promise<void> {
    const pub = createClient({ url: this.url });
    const sub = pub.duplicate();
    for (const client of [pub, sub]) {
      client.on('error', (err) => this.logger.error(`Redis: ${err.message}`));
    }
    await Promise.all([pub.connect(), sub.connect()]);
    this.adapterConstructor = createAdapter(pub, sub);
    this.logger.log('Chat rooms shared through Redis');
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    server.adapter(this.adapterConstructor);
    return server;
  }
}
