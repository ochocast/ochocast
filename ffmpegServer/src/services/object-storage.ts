import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Transform, Readable } from 'node:stream';
import { stat, unlink } from 'node:fs/promises';

export interface ObjectStorage {
  download(bucket: string, key: string, target: string, maxBytes: number, signal: AbortSignal): Promise<void>;
  upload(bucket: string, key: string, source: string, type: string, signal: AbortSignal): Promise<void>;
}
export class S3ObjectStorage implements ObjectStorage {
  constructor(private readonly client: S3Client) {}
  async download(bucket: string, key: string, target: string, maxBytes: number, signal: AbortSignal) {
    const r = await this.client.send(new GetObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: signal });
    const body = r.Body as Readable;
    if (!body?.pipe) throw new Error('S3 body is not a stream');
    let bytes = 0;
    const limit = new Transform({ transform(chunk, _encoding, done) {
      bytes += chunk.length;
      done(bytes > maxBytes ? new Error('Source exceeds disk budget') : null, chunk);
    } });
    try {
      if (r.ContentLength !== undefined && r.ContentLength > maxBytes) throw new Error('Source exceeds disk budget');
      await pipeline(body, limit, createWriteStream(target, { flags: 'wx' }), { signal });
      if (r.ContentLength !== undefined && bytes !== r.ContentLength) throw new Error('Incomplete S3 download');
    } catch (e) { body.destroy(); await unlink(target).catch(() => undefined); throw e; }
  }
  async upload(bucket: string, key: string, source: string, type: string, signal: AbortSignal) {
    signal.throwIfAborted();
    const body = createReadStream(source);
    const upload = new Upload({ client: this.client, queueSize: 1, partSize: 5 * 1024 ** 2,
      params: { Bucket: bucket, Key: key, Body: body, ContentLength: (await stat(source)).size,
        ContentType: type, CacheControl: type.includes('mpegurl') ? 'no-cache' : 'max-age=31536000' } });
    const abort = () => { body.destroy(); void upload.abort(); };
    signal.addEventListener('abort', abort, { once: true });
    try { await upload.done(); } finally { signal.removeEventListener('abort', abort); body.destroy(); }
  }
}
