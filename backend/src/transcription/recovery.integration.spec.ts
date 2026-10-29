import { DataSource } from 'typeorm';
import { createServer, Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';

const integration = process.env.TRANSCRIPTION_TEST_DATABASE_URL
  ? describe
  : describe.skip;

integration('independent worker recovery', () => {
  let db: DataSource;
  let server: Server;
  let calls = 0;
  const schema = `recovery_${randomUUID().replace(/-/g, '')}`;
  const url = new URL(
    process.env.TRANSCRIPTION_TEST_DATABASE_URL ||
      'postgresql://localhost/unused',
  );

  beforeAll(async () => {
    if (!['localhost', '127.0.0.1'].includes(url.hostname))
      throw new Error('Recovery tests require an isolated local database');
    db = new DataSource({
      type: 'postgres',
      url: url.toString(),
      extra: { options: `-c search_path=${schema}` },
    });
    await db.initialize();
    await db.query(`CREATE SCHEMA ${schema}`);
    await db.query(`CREATE TABLE transcription_runtime (
      id integer PRIMARY KEY, worker_requested boolean NOT NULL)`);
    await db.query('INSERT INTO transcription_runtime VALUES (1, true)');
    server = createServer((_request, response) => {
      calls += 1;
      response.writeHead(200);
      response.end('{}');
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
  });

  afterAll(async () => {
    if (server)
      await new Promise<void>((resolve) => server.close(() => resolve()));
    if (db?.isInitialized) {
      await db.query(`DROP SCHEMA ${schema} CASCADE`);
      await db.destroy();
    }
  });

  it('never stops a locked batch, and stops a marked orphan after the lock is released', async () => {
    const runner = db.createQueryRunner();
    await runner.connect();
    const run = () =>
      promisify(execFile)(
        process.execPath,
        [
          '-r',
          'ts-node/register',
          '-r',
          'tsconfig-paths/register',
          path.join(__dirname, 'recover-worker.ts'),
        ],
        {
          cwd: path.resolve(__dirname, '../..'),
          timeout: 30_000,
          env: {
            ...process.env,
            NODE_ENV: 'test',
            PG_HOST: url.hostname,
            PG_PORT: url.port,
            PG_DATABASE: url.pathname.slice(1),
            PG_USERNAME: decodeURIComponent(url.username),
            PG_PASSWORD: decodeURIComponent(url.password),
            PGOPTIONS: `-c search_path=${schema}`,
            WORKER_STOP_URL: `http://127.0.0.1:${(server.address() as { port: number }).port}/stop`,
            WORKER_CONTROL_TOKEN:
              'test-control-token-with-at-least-32-characters',
          },
        },
      );
    try {
      await runner.query('SELECT pg_advisory_lock($1)', [1791540000]);
      await run();
      expect(calls).toBe(0);
      await runner.query('SELECT pg_advisory_unlock($1)', [1791540000]);
      await run();
      expect(calls).toBe(1);
      const [row] = await runner.query(
        'SELECT worker_requested FROM transcription_runtime WHERE id = 1',
      );
      expect(row.worker_requested).toBe(false);
    } finally {
      await runner.release();
    }
  }, 60_000);
});
