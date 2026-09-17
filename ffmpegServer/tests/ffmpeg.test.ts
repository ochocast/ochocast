import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { S3Client } from '@aws-sdk/client-s3';
import { TranscodingService } from '../src/services/transcoding.service';

test('real FFmpeg generates three HLS variants, a thumbnail and a WAV', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ochocast-ffmpeg-test-'));
  const input = path.join(directory, 'input.mp4');
  const output = path.join(directory, 'hls');
  const s3 = new S3Client({ region: 'us-east-1' });
  try {
    await mkdir(output);
    await promisify(execFile)(process.env.FFMPEG_PATH || 'ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=blue:s=320x180:r=10',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:sample_rate=44100',
      '-t',
      '2',
      '-c:v',
      'libx264',
      '-c:a',
      'aac',
      '-pix_fmt',
      'yuv420p',
      input,
    ]);
    const service = new TranscodingService(s3);
    assert.equal(await service.hasAudio(input), true);
    assert.equal(await service.getVideoDuration(input), 2);
    await service.transcodeVideoHLS(input, output);
    const master = await readFile(path.join(output, 'master.m3u8'), 'utf8');
    for (const variant of ['360p', '480p', '720p']) {
      assert.match(master, new RegExp(`${variant}\\.m3u8`));
      assert.match(
        await readFile(path.join(output, `${variant}.m3u8`), 'utf8'),
        /#EXT-X-ENDLIST/,
      );
      assert.ok((await stat(path.join(output, `${variant}0.ts`))).size > 0);
    }
    await service.generateThumbnail(
      input,
      path.join(directory, 'thumbnail.jpg'),
    );
    await service.extractAudioWav(input, path.join(directory, 'audio.wav'));
    assert.ok((await stat(path.join(directory, 'thumbnail.jpg'))).size > 0);
    assert.equal(
      (await readFile(path.join(directory, 'audio.wav')))
        .subarray(0, 4)
        .toString(),
      'RIFF',
    );
  } finally {
    s3.destroy();
    await rm(directory, { recursive: true, force: true });
  }
});
