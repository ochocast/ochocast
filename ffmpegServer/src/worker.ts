import 'dotenv/config';
import { createS3Client } from './config/s3.config';
import { QueueService } from './services/queue.service';
import { TranscodingService } from './services/transcoding.service';
import { S3ObjectStorage } from './services/object-storage';
import { createServer, Server } from 'node:http';
import { readdir, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export class FFmpegWorker {
  private queue = new QueueService();
  private storage = new S3ObjectStorage(createS3Client());
  private stopping = false;
  private active = new Map<AbortController, Promise<void>>();
  private health?: Server;
  private reconnecting = false;
  private timer?: NodeJS.Timeout;
  constructor() {
    this.queue.onDisconnect = () => {
      for (const c of this.active.keys()) c.abort();
      this.schedule();
    };
  }
  async start() {
    // This directory must be exclusive to this worker process/container.
    const root = process.env.TRANSCODING_TMP_DIR || path.join(tmpdir(), 'transcoding');
    await mkdir(root, { recursive: true });
    for (const name of await readdir(root)) if (name.startsWith('job-')) await rm(path.join(root, name), { recursive: true, force: true });
    this.health = createServer((req, res) => {
      const ready = this.queue.ready && !this.stopping;
      res.writeHead(req.url === '/healthz' ? 200 : req.url === '/readyz' ? (ready ? 200 : 503) : 404,
        { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ready, activeJobs: this.active.size }));
    });
    this.health.listen(Number(process.env.HEALTH_PORT || 8080), '0.0.0.0');
    await this.connect();
  }
  private schedule() {
    if (this.timer || this.stopping) return;
    this.timer = setTimeout(() => { this.timer = undefined; void this.connect(); }, 5000);
  }
  private async connect() {
    if (this.stopping || this.reconnecting || this.queue.ready) return;
    this.reconnecting = true;
    try {
      await Promise.allSettled(this.active.values());
      if (this.stopping) return;
      await this.queue.connect();
      if (this.stopping) { await this.queue.close(); return; }
      // One job per process. Scale via separate dedicated compute instances.
      await this.queue.consumeJobs(async (job, message) => {
        if (this.stopping) { this.queue.nackJob(message, true); return; }
        const controller = new AbortController();
        const task = (async () => {
          try {
            const result = await new TranscodingService(this.storage, controller.signal).processJob(job);
            controller.signal.throwIfAborted();
            await this.queue.publishResult(result, message);
            this.queue.ackJob(message);
          } catch (e) {
            console.error(`Job ${job.jobId} interrupted; delivery will be replayed`, e instanceof Error ? e.message : e);
            this.queue.nackJob(message, true);
          }
        })();
        this.active.set(controller, task);
        try { await task; } finally { this.active.delete(controller); }
      }, 1);
    } catch (e) {
      console.error('RabbitMQ unavailable; retrying', e instanceof Error ? e.message : e);
      await this.queue.close(); this.schedule();
    } finally { this.reconnecting = false; }
  }
  async stop() {
    if (this.stopping) return;
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    await this.queue.stopConsuming();
    for (const controller of this.active.keys()) controller.abort();
    await Promise.allSettled(this.active.values());
    await this.queue.close();
    await new Promise<void>(resolve => this.health ? this.health.close(() => resolve()) : resolve());
  }
}
if (require.main === module) {
  const worker = new FFmpegWorker();
  void worker.start().catch(error => { console.error(error); process.exitCode = 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
    const deadline = setTimeout(() => process.exit(1), 75000).unref();
    void worker.stop().then(() => { clearTimeout(deadline); process.exit(0); });
  });
}
