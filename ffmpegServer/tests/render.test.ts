import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { cp, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { test, TestContext } from 'node:test';
import { promisify } from 'node:util';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { HttpError } from '../src/serverless/job-envelope';
import {
  isValidRenderJob,
  parseRenderEnvelope,
} from '../src/serverless/render-envelope';
import { RenderRunner } from '../src/serverless/render-runner';
import { drawTextFilter, RenderService } from '../src/services/render.service';
import { wrapText } from '../src/services/text-wrap';
import {
  PermanentJobError,
  VideoEditRenderJob,
  VideoEditRenderMessage,
  VideoEditRenderResult,
} from '../src/types/job.types';

const run = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const secret = 'test-dispatch-secret-at-least-32-characters';

const message = (
  overrides: Partial<VideoEditRenderMessage> = {},
): VideoEditRenderMessage => ({
  jobId: randomUUID(),
  editId: randomUUID(),
  videoId: randomUUID(),
  version: 2,
  timestamp: Date.now(),
  ...overrides,
});

const fullJob = (
  m: VideoEditRenderMessage,
  overrides: Partial<VideoEditRenderJob> = {},
): VideoEditRenderJob => ({
  ...m,
  sourceKey: `${m.videoId}/source/original.mp4`,
  outputPrefix: `${m.videoId}/edits/${m.jobId}`,
  segments: [
    {
      sourceStart: 3,
      sourceEnd: 5,
      textLayers: [
        {
          content: 'Merci !',
          position: 'center',
          color: 'green',
          startOffset: 0,
          duration: 1,
        },
      ],
    },
    {
      sourceStart: 0,
      sourceEnd: 2,
      textLayers: [
        {
          // Never interpreted: no %{...} expansion, no filter syntax.
          content: "50% : l'%{pts} ouverture, [x]",
          position: 'bottom',
          color: 'white',
          startOffset: 0.5,
          duration: 1,
        },
      ],
    },
  ],
  ...overrides,
});

const sign = (job: unknown) => ({
  job,
  signature: createHmac('sha256', secret)
    .update(JSON.stringify(job))
    .digest('hex'),
});

const statusOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error instanceof HttpError ? error.status : -1;
  }
  return 0;
};

test('wraps texts like the backend validation', () => {
  assert.deepEqual(
    wrapText('Partie 2 : démonstration du nouveau lecteur vidéo en direct'),
    ['Partie 2 : démonstration du nouveau', 'lecteur vidéo en direct'],
  );
  assert.deepEqual(wrapText('  Merci\n\n  à tous  '), ['Merci à tous']);
  assert.deepEqual(wrapText(`a ${'y'.repeat(45)} b`), [
    'a',
    'y'.repeat(40),
    'yyyyy b',
  ]);
});

test('accepts a signed render message and rejects a tampered one', () => {
  const m = message();
  assert.deepEqual(parseRenderEnvelope(sign(m), secret), m);
  const tampered = sign(m);
  tampered.job = { ...m, version: 3 };
  assert.equal(
    statusOf(() => parseRenderEnvelope(tampered, secret)),
    401,
  );
  assert.equal(
    statusOf(() => parseRenderEnvelope(sign({ ...m, version: 0 }), secret)),
    400,
  );
  assert.equal(
    statusOf(() => parseRenderEnvelope(sign({ ...m, editId: 'nope' }), secret)),
    400,
  );
});

test('only runs a claimed job that is the message job, writing in its folder', () => {
  const m = message();
  assert.equal(isValidRenderJob(fullJob(m), m), true);
  for (const job of [
    fullJob(m, { outputPrefix: `${m.videoId}` }),
    fullJob(m, { outputPrefix: `${m.videoId}/edits/${randomUUID()}` }),
    fullJob(m, { sourceKey: `${m.videoId}/../other/original.mp4` }),
    fullJob(m, { version: 3 }),
    fullJob(m, { segments: [] }),
    fullJob(m, {
      segments: [{ sourceStart: 2, sourceEnd: 1, textLayers: [] }],
    }),
    fullJob(m, {
      segments: [
        {
          sourceStart: 0,
          sourceEnd: 1,
          textLayers: [
            {
              content: 'x',
              position: 'top',
              color: 'red' as any,
              startOffset: 0,
              duration: 1,
            },
          ],
        },
      ],
    }),
  ])
    assert.equal(isValidRenderJob(job, m), false);
});

test('draws a text from its file with the fixed style, never expanding it', () => {
  const filter = drawTextFilter(
    {
      content: 'ignored: read from the file',
      position: 'bottom',
      color: 'green',
      startOffset: 1.5,
      duration: 2,
    },
    '/work/text-0-0.txt',
    '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
  );
  assert.equal(
    filter,
    "drawtext=fontfile='/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf'" +
      ":textfile='/work/text-0-0.txt':expansion=none:fontsize=40" +
      ':line_spacing=10:fontcolor=0x1DAC78:borderw=3:bordercolor=black' +
      ":x=(w-text_w)/2:y=h*0.88-text_h:enable='between(t,1.500,3.500)'",
  );
  assert.throws(
    () =>
      drawTextFilter(
        {
          content: 'x',
          position: 'top',
          color: 'white',
          startOffset: 0,
          duration: 1,
        },
        "/work/it's.txt",
        '/font.ttf',
      ),
    /Unsupported path/,
  );
});

const claimed = (job: VideoEditRenderJob) => ({
  status: 'claimed' as const,
  leaseToken: randomUUID(),
  leaseExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  job,
});

const runnerWith = (
  render: RenderService['render'],
  stored: 'stored' | 'gone' = 'stored',
) => {
  const m = message();
  const reported: VideoEditRenderResult[] = [];
  const removed: string[] = [];
  const runner = new RenderRunner(
    {
      claim: async () => claimed(fullJob(m)),
      complete: async (_id, _token, result) => {
        reported.push(result);
        return stored;
      },
    },
    {
      render,
      remove: async (prefix: string) => {
        removed.push(prefix);
      },
    },
    60_000,
  );
  return { m, runner, reported, removed };
};

test('renders then reports the rendition to the backend', async () => {
  const { m, runner, reported } = runnerWith(async (job) => ({
    duration: 4,
    mediaId: `${job.outputPrefix}/master.m3u8`,
  }));
  await runner.run(m, new AbortController().signal);
  assert.equal(reported.length, 1);
  assert.deepEqual(
    { ...reported[0], processedAt: 0 },
    {
      jobId: m.jobId,
      editId: m.editId,
      success: true,
      duration: 4,
      mediaId: `${m.videoId}/edits/${m.jobId}/master.m3u8`,
      processedAt: 0,
    },
  );
});

test('reports a transient failure, then refuses the ack so the queue retries', async () => {
  const { m, runner, reported } = runnerWith(async () => {
    throw new Error('S3 timeout');
  });
  await assert.rejects(runner.run(m, new AbortController().signal), (e) => {
    assert.ok(e instanceof HttpError);
    assert.equal(e.status, 503);
    return true;
  });
  assert.equal(reported[0].success, false);
  assert.equal(reported[0].permanent, undefined);
});

test('acknowledges a permanent failure after reporting it', async () => {
  const { m, runner, reported } = runnerWith(async () => {
    throw new PermanentJobError('invalid_source', 'Original file not found');
  });
  await runner.run(m, new AbortController().signal);
  assert.equal(reported[0].permanent, true);
  assert.equal(reported[0].reason, 'invalid_source');
});

test('removes the files of a render whose video was deleted meanwhile', async () => {
  const { m, runner, removed } = runnerWith(
    async (job) => ({
      duration: 4,
      mediaId: `${job.outputPrefix}/master.m3u8`,
    }),
    'gone',
  );
  await runner.run(m, new AbortController().signal);
  assert.deepEqual(removed, [`${m.videoId}/edits/${m.jobId}`]);
});

test('fails for good a render cut by its deadline once encoding started', async () => {
  const m = message();
  const reported: VideoEditRenderResult[] = [];
  const runner = new RenderRunner(
    {
      claim: async () => claimed(fullJob(m)),
      complete: async (_id, _token, result) => {
        reported.push(result);
        return 'stored';
      },
    },
    {
      render: (_job, signal, started) =>
        new Promise((_resolve, reject) => {
          started?.();
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
      remove: async () => undefined,
    },
    50,
  );
  // A lease shorter than timeout + 30 s is refused: use a long one.
  await runner.run(m, new AbortController().signal);
  assert.equal(reported[0].permanent, true);
  assert.equal(reported[0].reason, 'deadline_exceeded');
});

// ---------------------------------------------------------------------------
// Real FFmpeg on a small generated video.
// ---------------------------------------------------------------------------

async function workRoot(t: TestContext): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'render-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

/** RGB pixels of a crop of the frame at `at` seconds of an HLS playlist. */
async function pixels(
  playlist: string,
  at: number,
  crop: string,
): Promise<Buffer> {
  const { stdout } = await run(
    FFMPEG,
    [
      '-v',
      'error',
      '-ss',
      String(at),
      '-i',
      playlist,
      '-frames:v',
      '1',
      '-vf',
      `crop=${crop}`,
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      'pipe:1',
    ],
    { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 },
  );
  return stdout as unknown as Buffer;
}

const count = (
  rgb: Buffer,
  keep: (r: number, g: number, b: number) => boolean,
) => {
  let n = 0;
  for (let i = 0; i + 2 < rgb.length; i += 3)
    if (keep(rgb[i], rgb[i + 1], rgb[i + 2])) n++;
  return n;
};
const mean = (rgb: Buffer) => rgb.reduce((sum, v) => sum + v, 0) / rgb.length;
const isGreen = (r: number, g: number, b: number) => g > r + 60 && g > b + 30;
const isWhite = (r: number, g: number, b: number) =>
  r > 220 && g > 220 && b > 220;

test('renders segments in playback order with their texts, as HLS', async (t) => {
  const root = await workRoot(t);
  process.env.TRANSCODING_WORK_DIR = path.join(root, 'work');
  t.after(() => delete process.env.TRANSCODING_WORK_DIR);
  // Grey whose brightness grows with time: the order of the segments shows
  // in the output, and a text stands out of it.
  const source = path.join(root, 'source.mp4');
  await run(FFMPEG, [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    "color=c=black:s=320x180:r=10:d=6,format=yuv420p,geq=lum_expr='min(255,20+T*30)':cb_expr=128:cr_expr=128",
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=6',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    source,
  ]);

  const m = message();
  const job = fullJob(m);
  const puts: string[] = [];
  const s3 = {
    send: async (command: unknown) => {
      if (command instanceof HeadObjectCommand)
        return { ContentLength: (await stat(source)).size };
      if (command instanceof GetObjectCommand) {
        if (command.input.Key === job.sourceKey)
          return { Body: createReadStream(source) };
        throw Object.assign(new Error('missing'), { name: 'NoSuchKey' });
      }
      if (command instanceof PutObjectCommand) {
        puts.push(command.input.Key!);
        return {};
      }
      throw new Error(`Unexpected S3 command ${String(command)}`);
    },
  } as unknown as S3Client;
  const service = new RenderService(s3);
  const output = path.join(root, 'hls');
  t.mock.method(
    service,
    'uploadRendition',
    async (_transcoder: unknown, hlsDir: string, prefix: string) => {
      assert.equal(prefix, job.outputPrefix);
      await cp(hlsDir, output, { recursive: true });
    },
  );

  const result = await service.render(job, new AbortController().signal);

  assert.equal(result.mediaId, `${job.outputPrefix}/master.m3u8`);
  assert.ok(Math.abs(result.duration - 4) < 0.3, `duration ${result.duration}`);
  const files = await readdir(output);
  for (const playlist of ['master.m3u8', '360p.m3u8', '480p.m3u8', '720p.m3u8'])
    assert.ok(files.includes(playlist), `${playlist} missing`);
  assert.ok(files.some((f) => f.endsWith('.ts')));
  // The checkpoint lets a lost callback skip a second render.
  assert.deepEqual(puts, [`${job.outputPrefix}/_result.json`]);

  const hls = path.join(output, '720p.m3u8');
  // Source 3-5 s plays first: brighter than source 0-2 s after it.
  const corner = '100:60:0:0';
  assert.ok(
    mean(await pixels(hls, 0.2, corner)) >
      mean(await pixels(hls, 2.2, corner)) + 40,
    'segments not in playback order',
  );
  // Green text in the centre during its second, gone after it.
  const centre = '640:120:320:300';
  assert.ok(count(await pixels(hls, 0.5, centre), isGreen) > 200);
  assert.equal(count(await pixels(hls, 1.5, centre), isGreen), 0);
  // White text at the bottom, 0.5 s into the second segment only.
  const bottom = '1280:110:0:520';
  assert.ok(count(await pixels(hls, 3.0, bottom), isWhite) > 200);
  assert.equal(count(await pixels(hls, 2.2, bottom), isWhite), 0);
  // Nothing is left in the work directory.
  assert.deepEqual(await readdir(process.env.TRANSCODING_WORK_DIR!), []);
});

test('fails for good when the original is gone', async (t) => {
  const root = await workRoot(t);
  process.env.TRANSCODING_WORK_DIR = root;
  // A placeholder font, never read: the source is missing before any
  // encoding, so the test does not need DejaVu installed.
  const fontFile = path.join(root, 'placeholder-font.ttf');
  await writeFile(fontFile, '');
  const previousFont = process.env.FFMPEG_FONT_FILE;
  process.env.FFMPEG_FONT_FILE = fontFile;
  t.after(() => {
    delete process.env.TRANSCODING_WORK_DIR;
    if (previousFont === undefined) delete process.env.FFMPEG_FONT_FILE;
    else process.env.FFMPEG_FONT_FILE = previousFont;
  });
  const job = fullJob(message());
  const asked: string[] = [];
  const s3 = {
    send: async (command: { input: { Key?: string } }) => {
      asked.push(command.input.Key!);
      throw Object.assign(new Error('missing'), {
        name: 'NotFound',
        $metadata: { httpStatusCode: 404 },
      });
    },
  } as unknown as S3Client;
  await assert.rejects(
    new RenderService(s3).render(job, new AbortController().signal),
    (e) => e instanceof PermanentJobError && e.reason === 'invalid_source',
  );
  // It failed on the original itself, not before reaching it.
  assert.ok(asked.includes(job.sourceKey), `source never asked: ${asked}`);
});
