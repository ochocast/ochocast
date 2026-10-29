import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { S3Client } from '@aws-sdk/client-s3';
import { TranscodingService } from '../src/services/transcoding.service';
import {
  HLS_VARIANTS,
  PermanentJobError,
  VideoTranscodingJob,
} from '../src/types/job.types';

test('real FFmpeg generates three HLS variants, a thumbnail and a FLAC', async () => {
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
    assert.deepEqual(await service.probeSource(input), {
      duration: 2,
      codecsPlayable: true,
      hasAudio: true,
    });
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
    await service.extractAudioFlac(input, path.join(directory, 'audio.flac'));
    assert.ok((await stat(path.join(directory, 'thumbnail.jpg'))).size > 0);
    assert.equal(
      (await readFile(path.join(directory, 'audio.flac')))
        .subarray(0, 4)
        .toString(),
      'fLaC',
    );
  } finally {
    s3.destroy();
    await rm(directory, { recursive: true, force: true });
  }
});

const ffmpeg = (...args: string[]) =>
  promisify(execFile)(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    ...args,
  ]);
// A short H.264/AAC clip; the audio is 48 kHz stereo with different channels,
// so the 16 kHz mono extraction really resamples and downmixes.
const clip = (file: string, audio = true, seconds = 2) =>
  ffmpeg(
    '-f',
    'lavfi',
    '-i',
    'testsrc2=s=320x180:r=10',
    ...(audio
      ? [
          '-f',
          'lavfi',
          '-i',
          "aevalsrc='0.4*sin(440*2*PI*t)+0.1*(random(0)-0.5)|0.3*sin(660*2*PI*t)':s=48000",
        ]
      : []),
    '-t',
    String(seconds),
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    ...(audio ? ['-c:a', 'aac'] : []),
    file,
  );
const fixtureJob: VideoTranscodingJob = {
  jobId: 'job',
  videoId: 'video',
  originalKey: 'video/source/original.mp4',
  originalFileName: 'test.mp4',
  media_id: 'video/master.m3u8',
  miniature_id: 'miniature-video.jpg',
  subtitle_id: 'subtitle-video.vtt',
  title: 'Test',
  timestamp: 1,
};
type Uploads = { uploadFile: (...args: string[]) => Promise<void> };
const withDirectory = async (body: (directory: string) => Promise<void>) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ochocast-ffmpeg-test-'));
  try {
    await body(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};
const setEnv = (
  t: { after: (fn: () => void) => void },
  name: string,
  value: string,
) => {
  const previous = process.env[name];
  process.env[name] = value;
  t.after(() => {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  });
};
const invalidSource = (error: unknown) =>
  error instanceof PermanentJobError && error.reason === 'invalid_source';

test('unreadable inputs and inputs without video are permanent invalid sources', async (t) => {
  await withDirectory(async (directory) => {
    const video = path.join(directory, 'input.mp4');
    const audioOnly = path.join(directory, 'audio.m4a');
    const garbage = path.join(directory, 'garbage.mp4');
    await clip(video);
    await ffmpeg(
      '-f',
      'lavfi',
      '-i',
      'sine',
      '-t',
      '1',
      '-c:a',
      'aac',
      audioOnly,
    );
    await writeFile(garbage, 'not a video');
    const service = new TranscodingService({} as S3Client);
    assert.equal((await service.probeSource(video)).duration, 2);
    await assert.rejects(service.probeSource(garbage), invalidSource);
    await assert.rejects(service.probeSource(audioOnly), invalidSource);
    // A missing binary is a deployment problem, not the source: still retryable.
    setEnv(t, 'FFPROBE_PATH', path.join(directory, 'missing-ffprobe'));
    await assert.rejects(
      service.probeSource(video),
      (error: unknown) => !(error instanceof PermanentJobError),
    );
  });
});

test('the probe tells whether browsers decode the source as is', async () => {
  await withDirectory(async (directory) => {
    const h264 = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p'];
    const source = async (
      name: string,
      video: string[],
      audio = ['-c:a', 'aac'],
    ) => {
      const file = path.join(directory, name);
      await ffmpeg(
        '-f',
        'lavfi',
        '-i',
        'testsrc2=s=64x64:r=10',
        '-f',
        'lavfi',
        '-i',
        'sine',
        '-t',
        '1',
        ...video,
        ...audio,
        file,
      );
      return file;
    };
    const cover = path.join(directory, 'cover.png');
    await ffmpeg(
      '-f',
      'lavfi',
      '-i',
      'color=c=red:s=32x32',
      '-frames:v',
      '1',
      cover,
    );
    const withCover = path.join(directory, 'with-cover.mp4');
    await ffmpeg(
      '-i',
      await source('h264-aac.mp4', h264),
      '-i',
      cover,
      '-map',
      '0',
      '-map',
      '1',
      '-c',
      'copy',
      '-c:v:1',
      'mjpeg',
      '-disposition:v:1',
      'attached_pic',
      withCover,
    );
    const service = new TranscodingService({} as S3Client);
    const playable = async (file: string) =>
      (await service.probeSource(file)).codecsPlayable;

    assert.equal(await playable(path.join(directory, 'h264-aac.mp4')), true);
    // Smoke test only: FFmpeg's muxer lists the cover after the video.
    assert.equal(await playable(withCover), true);
    assert.equal(
      await playable(await source('h264-silent.mp4', h264, ['-an'])),
      true,
    );
    assert.equal(
      await playable(
        await source(
          'vp9-opus.webm',
          [
            '-c:v',
            'libvpx-vp9',
            '-deadline',
            'realtime',
            '-pix_fmt',
            'yuv420p',
          ],
          ['-c:a', 'libopus'],
        ),
      ),
      true,
    );
    // The iPhone default: Chrome on Linux and many Firefox setups cannot decode it.
    assert.equal(
      await playable(
        await source('hevc.mov', [
          '-c:v',
          'libx265',
          '-x265-params',
          'log-level=error',
          '-tag:v',
          'hvc1',
          '-pix_fmt',
          'yuv420p',
        ]),
      ),
      false,
    );
    assert.equal(
      await playable(
        await source('h264-444.mp4', [
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv444p',
        ]),
      ),
      false,
    );
    assert.equal(
      await playable(await source('mpeg4.mp4', ['-c:v', 'mpeg4'])),
      false,
    );
    assert.equal(
      await playable(await source('h264-pcm.mov', h264, ['-c:a', 'pcm_s16le'])),
      false,
    );
  });
});

test('the probe judges the main video, even after a cover image listed first', async (t) => {
  // FFmpeg's mp4 muxer always lists a cover last; other tools may not.
  await withDirectory(async (directory) => {
    const ffprobe = path.join(directory, 'ffprobe');
    const output = {
      streams: [
        {
          codec_name: 'mjpeg',
          codec_type: 'video',
          pix_fmt: 'yuvj444p',
          disposition: { attached_pic: 1 },
        },
        {
          codec_name: 'h264',
          codec_type: 'video',
          pix_fmt: 'yuv420p',
          disposition: { attached_pic: 0 },
        },
        {
          codec_name: 'aac',
          codec_type: 'audio',
          disposition: { attached_pic: 0 },
        },
      ],
      format: { duration: '3.500000' },
    };
    await writeFile(
      ffprobe,
      `#!/bin/sh\ncat <<'JSON'\n${JSON.stringify(output)}\nJSON\n`,
    );
    await chmod(ffprobe, 0o755);
    setEnv(t, 'FFPROBE_PATH', ffprobe);
    assert.deepEqual(
      await new TranscodingService({} as S3Client).probeSource('source.mp4'),
      { duration: 3, codecsPlayable: true, hasAudio: true },
    );
  });
});

// runProcess keeps only the tail of an oversized output: it no longer parses.
test('a probe output that is not valid JSON is a permanent invalid source', async (t) => {
  await withDirectory(async (directory) => {
    const ffprobe = path.join(directory, 'ffprobe');
    await writeFile(ffprobe, `#!/bin/sh\necho '"codec_type": "video"}]}'\n`);
    await chmod(ffprobe, 0o755);
    setEnv(t, 'FFPROBE_PATH', ffprobe);
    await assert.rejects(
      new TranscodingService({} as S3Client).probeSource('source.mp4'),
      invalidSource,
    );
  });
});

test('the probe reads a source with many streams (multi-language subtitles)', async () => {
  await withDirectory(async (directory) => {
    const video = path.join(directory, 'video.mp4');
    const subtitle = path.join(directory, 'subtitle.srt');
    const source = path.join(directory, 'source.mkv');
    await clip(video);
    await writeFile(subtitle, '1\n00:00:00,000 --> 00:00:01,000\nHello\n');
    // 60 subtitle tracks: the probe output is well above 8 KiB.
    await ffmpeg(
      '-i',
      video,
      '-i',
      subtitle,
      '-map',
      '0',
      ...Array.from({ length: 60 }, () => ['-map', '1']).flat(),
      '-c',
      'copy',
      source,
    );
    assert.deepEqual(
      await new TranscodingService({} as S3Client).probeSource(source),
      { duration: 2, codecsPlayable: true, hasAudio: true },
    );
  });
});

test('a video above TRANSCODING_MAX_DURATION_SECONDS publishes its attachments, then fails permanently without encoding', async (t) => {
  setEnv(t, 'TRANSCODING_MAX_DURATION_SECONDS', '1');
  const uploads: string[] = [];
  t.mock.method(
    TranscodingService.prototype as unknown as Uploads,
    'uploadFile',
    async (_file: string, _bucket: string, key: string) => {
      uploads.push(key);
    },
  );
  const encode = t.mock.method(
    TranscodingService.prototype,
    'transcodeVideoHLS',
    async () => {},
  );
  t.mock.method(console, 'error', () => {});
  let encodingStarted = false;
  await withDirectory(async (directory) => {
    const input = path.join(directory, 'input.mp4');
    await clip(input);
    const result = await new TranscodingService(
      {} as S3Client,
      undefined,
      () => (encodingStarted = true),
    ).processJob(fixtureJob, input, undefined, Buffer.from('WEBVTT\n'), true);
    assert.equal(result.success, false);
    assert.equal(result.permanent, true);
    assert.equal(result.reason, 'duration_exceeded');
    assert.equal(result.duration, 2);
    assert.equal(result.sourceCodecsPlayable, true);
    assert.match(result.error || '', /TRANSCODING_MAX_DURATION_SECONDS/);
    // The backend then plays the source: its final miniature and subtitle exist.
    assert.deepEqual(uploads.sort(), [
      'miniature-video.jpg',
      'subtitle-video.vtt',
      'video/audio.flac',
    ]);
    assert.equal(result.audio_key, 'video/audio.flac');
    assert.equal(result.has_audio, true);
    assert.equal(encode.mock.callCount(), 0);
    assert.equal(encodingStarted, false);
  });
});

test('a too long video that browsers cannot play from its source extracts no FLAC', async (t) => {
  setEnv(t, 'TRANSCODING_MAX_DURATION_SECONDS', '1');
  t.mock.method(
    TranscodingService.prototype as unknown as Uploads,
    'uploadFile',
    async () => {},
  );
  const extract = t.mock.method(
    TranscodingService.prototype,
    'extractAudioFlac',
    async () => {},
  );
  t.mock.method(console, 'error', () => {});
  await withDirectory(async (directory) => {
    const input = path.join(directory, 'input.mp4');
    await clip(input);
    // The backend fails such a video: a FLAC would never be read.
    const result = await new TranscodingService({} as S3Client).processJob(
      { ...fixtureJob, originalKey: 'video/source/original.mkv' },
      input,
      undefined,
      undefined,
      true,
    );
    assert.equal(result.reason, 'duration_exceeded');
    assert.equal(extract.mock.callCount(), 0);
    assert.equal(result.audio_key, undefined);
  });
});

test('a FLAC failure does not cost a too long video its source playback', async (t) => {
  setEnv(t, 'TRANSCODING_MAX_DURATION_SECONDS', '1');
  t.mock.method(
    TranscodingService.prototype as unknown as Uploads,
    'uploadFile',
    async () => {},
  );
  t.mock.method(TranscodingService.prototype, 'extractAudioFlac', async () => {
    throw Object.assign(new Error('ffmpeg exited with code 1'), {
      exitCode: 1,
    });
  });
  t.mock.method(console, 'error', () => {});
  t.mock.method(console, 'warn', () => {});
  await withDirectory(async (directory) => {
    const input = path.join(directory, 'input.mp4');
    await clip(input);
    const result = await new TranscodingService({} as S3Client).processJob(
      fixtureJob,
      input,
      undefined,
      undefined,
      true,
    );
    assert.equal(result.permanent, true);
    assert.equal(result.reason, 'duration_exceeded');
    assert.equal(result.sourceCodecsPlayable, true);
    assert.equal(result.audio_key, undefined);
  });
});

test('a shutdown or upload failure during the FLAC of a too long video stays retryable', async (t) => {
  setEnv(t, 'TRANSCODING_MAX_DURATION_SECONDS', '1');
  for (const failure of [
    new DOMException('The operation was aborted', 'AbortError'),
    new Error('S3 upload failed'),
  ]) {
    t.mock.restoreAll();
    t.mock.method(console, 'error', () => {});
    t.mock.method(console, 'warn', () => {});
    t.mock.method(
      TranscodingService.prototype as unknown as Uploads,
      'uploadFile',
      async () => {},
    );
    t.mock.method(
      TranscodingService.prototype,
      'extractAudioFlac',
      async () => {
        throw failure;
      },
    );
    await withDirectory(async (directory) => {
      const input = path.join(directory, 'input.mp4');
      await clip(input);
      const result = await new TranscodingService({} as S3Client).processJob(
        fixtureJob,
        input,
        undefined,
        undefined,
        true,
      );
      // Not permanent: the job is retried and the audio extracted again.
      assert.equal(result.success, false);
      assert.equal(result.permanent, undefined);
    });
  }
});

test('a full job uploads lossless FLAC audio, never WAV', async (t) => {
  const uploads: Array<{ key: string; type: string }> = [];
  let flacSamples = '';
  t.mock.method(
    TranscodingService.prototype as unknown as Uploads,
    'uploadFile',
    async (file: string, _bucket: string, key: string, type: string) => {
      uploads.push({ key, type });
      if (key.endsWith('.flac'))
        flacSamples = (await ffmpeg('-i', file, '-f', 'md5', '-')).stdout;
    },
  );
  await withDirectory(async (directory) => {
    const input = path.join(directory, 'input.mp4');
    await clip(input);
    const result = await new TranscodingService({} as S3Client).processJob(
      fixtureJob,
      input,
      undefined,
      undefined,
      true,
    );
    assert.equal(result.success, true, result.error);
    assert.deepEqual(
      uploads.filter(({ key }) => key.startsWith('video/audio')),
      [{ key: 'video/audio.flac', type: 'audio/flac' }],
    );
    assert.equal(
      uploads.some(({ key }) => key.endsWith('.wav')),
      false,
    );
    assert.match(flacSamples, /^MD5=[0-9a-f]{32}/);
  });
});

// A deadline after the HLS upload would otherwise discard a finished,
// playable HLS set: the FLAC is stored while the encode has not started.
test('the FLAC audio is stored before encoding starts', async (t) => {
  const events: string[] = [];
  t.mock.method(
    TranscodingService.prototype as unknown as Uploads,
    'uploadFile',
    async (_file: string, _bucket: string, key: string) => {
      events.push(`upload ${key}`);
    },
  );
  await withDirectory(async (directory) => {
    const input = path.join(directory, 'input.mp4');
    await clip(input);
    const result = await new TranscodingService({} as S3Client, undefined, () =>
      events.push('encoding started'),
    ).processJob(fixtureJob, input, undefined, undefined, true);
    assert.equal(result.success, true, result.error);
    const flac = events.indexOf('upload video/audio.flac');
    assert.ok(flac >= 0, events.join(', '));
    assert.ok(flac < events.indexOf('encoding started'), events.join(', '));
  });
});

test('a full job probes its source once', async (t) => {
  t.mock.method(
    TranscodingService.prototype as unknown as Uploads,
    'uploadFile',
    async () => {},
  );
  await withDirectory(async (directory) => {
    const input = path.join(directory, 'input.mp4');
    const calls = path.join(directory, 'ffprobe-calls');
    const ffprobe = path.join(directory, 'counting-ffprobe');
    await clip(input);
    await writeFile(
      ffprobe,
      `#!/bin/sh\necho call >> '${calls}'\nexec ${process.env.FFPROBE_PATH || 'ffprobe'} "$@"\n`,
    );
    await chmod(ffprobe, 0o755);
    setEnv(t, 'FFPROBE_PATH', ffprobe);
    const result = await new TranscodingService({} as S3Client).processJob(
      fixtureJob,
      input,
      undefined,
      undefined,
      true,
    );
    assert.equal(result.success, true, result.error);
    assert.equal((await readFile(calls, 'utf8')).trim().split('\n').length, 1);
  });
});

test('FLAC audio holds exactly the 16 kHz mono PCM samples Whisper reads', async () => {
  await withDirectory(async (directory) => {
    const input = path.join(directory, 'input.mp4');
    const wav = path.join(directory, 'audio.wav');
    const flac = path.join(directory, 'audio.flac');
    await clip(input);
    // The same samples as an uncompressed PCM s16le extraction.
    await ffmpeg(
      '-i',
      input,
      '-vn',
      '-acodec',
      'pcm_s16le',
      '-ar',
      '16000',
      '-ac',
      '1',
      wav,
    );
    await new TranscodingService({} as S3Client).extractAudioFlac(input, flac);
    const samples = async (file: string) =>
      (
        await ffmpeg(
          '-i',
          file,
          '-map',
          '0:a',
          '-c:a',
          'pcm_s16le',
          '-f',
          'md5',
          '-',
        )
      ).stdout;
    assert.match(await samples(wav), /^MD5=[0-9a-f]{32}/);
    assert.equal(await samples(flac), await samples(wav));
    const { stdout } = await promisify(execFile)(
      process.env.FFPROBE_PATH || 'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'stream=codec_name,sample_rate,channels,sample_fmt',
        '-of',
        'default=noprint_wrappers=1',
        flac,
      ],
    );
    assert.deepEqual(stdout.trim().split('\n').sort(), [
      'channels=1',
      'codec_name=flac',
      'sample_fmt=s16',
      'sample_rate=16000',
    ]);
    assert.ok((await stat(flac)).size < (await stat(wav)).size);
  });
});

type Spawn = { pid: number; args: string[] };
// Puts a recording FFMPEG_PATH in front of the real binary. The wrapper execs
// FFmpeg in place, so the PID it logs is FFmpeg's own.
const recordFfmpegSpawns = async (
  t: { after: (fn: () => void) => void },
  directory: string,
): Promise<() => Promise<Spawn[]>> => {
  const log = path.join(directory, 'ffmpeg-spawns.log');
  const wrapper = path.join(directory, 'ffmpeg-wrapper.sh');
  await writeFile(
    wrapper,
    [
      '#!/bin/sh',
      `{ echo "pid $$"; for arg in "$@"; do printf 'arg %s\\n' "$arg"; done; } >> '${log}'`,
      `exec '${process.env.FFMPEG_PATH || 'ffmpeg'}' "$@"`,
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  setEnv(t, 'FFMPEG_PATH', wrapper);
  return async () => {
    const spawns: Spawn[] = [];
    for (const line of (await readFile(log, 'utf8').catch(() => '')).split(
      '\n',
    )) {
      if (line.startsWith('pid '))
        spawns.push({ pid: Number(line.slice(4)), args: [] });
      else if (line.startsWith('arg ')) spawns.at(-1)?.args.push(line.slice(4));
    }
    return spawns;
  };
};
const ffprobeStreams = async (file: string) =>
  (
    JSON.parse(
      (
        await promisify(execFile)(process.env.FFPROBE_PATH || 'ffprobe', [
          '-v',
          'error',
          '-protocol_whitelist',
          'file',
          '-show_entries',
          'stream=codec_name,width,height,sample_rate',
          '-of',
          'json',
          file,
        ])
      ).stdout,
    ).streams as Array<Record<string, string | number>>
  )
    .map((stream) =>
      stream.codec_name === 'h264'
        ? `h264 ${stream.width}x${stream.height}`
        : `${stream.codec_name} ${stream.sample_rate}`,
    )
    .sort();
// The playlist and segment names the backend public proxy serves.
const servedByBackend = /^[a-zA-Z0-9_-]+\.(m3u8|ts)$/;
const expectedMaster = [
  '#EXTM3U',
  '#EXT-X-VERSION:3',
  '#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360',
  '360p.m3u8',
  '#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=854x480',
  '480p.m3u8',
  '#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720',
  '720p.m3u8',
].join('\n');

test('one FFmpeg process decodes the source once and encodes the three renditions with their former options', async (t) => {
  await withDirectory(async (directory) => {
    const input = path.join(directory, 'input.mp4');
    const output = path.join(directory, 'hls');
    await mkdir(output);
    await clip(input);
    setEnv(t, 'FFMPEG_THREADS', '3');
    const spawns = await recordFfmpegSpawns(t, directory);
    await new TranscodingService({} as S3Client).transcodeVideoHLS(
      input,
      output,
    );
    const recorded = await spawns();
    assert.equal(recorded.length, 1, 'a single FFmpeg process');
    // Per rendition, exactly the options of the former one-process-per-rendition
    // command: same codecs, bitrates, scaling, keyframes and segment duration.
    assert.deepEqual(recorded[0].args, [
      '-protocol_whitelist',
      'file,pipe',
      '-y',
      '-i',
      input,
      ...HLS_VARIANTS.flatMap((variant) => [
        '-c:v',
        'libx264',
        '-b:v',
        variant.bitrate,
        '-vf',
        `scale=${variant.scale}:force_original_aspect_ratio=decrease,pad=${variant.scale}:(ow-iw)/2:(oh-ih)/2`,
        '-pix_fmt',
        'yuv420p',
        '-preset',
        'fast',
        '-threads',
        '3',
        '-sc_threshold',
        '0',
        '-force_key_frames',
        'expr:gte(t,n_forced*5)',
        '-hls_time',
        '5',
        '-hls_playlist_type',
        'vod',
        '-hls_flags',
        'independent_segments',
        '-hls_segment_type',
        'mpegts',
        '-c:a',
        'aac',
        '-ar',
        '48000',
        '-b:a',
        '128k',
        '-sn',
        '-dn',
        path.join(output, `${variant.name}.m3u8`),
      ]),
    ]);
  });
});

test('HLS output keeps the flat layout and names the backend serves, and FFprobe reads every playlist', async () => {
  await withDirectory(async (directory) => {
    const input = path.join(directory, 'input.mp4');
    const output = path.join(directory, 'hls');
    await mkdir(output);
    await clip(input, true, 12);
    await new TranscodingService({} as S3Client).transcodeVideoHLS(
      input,
      output,
    );
    const files = (await readdir(output)).sort();
    assert.deepEqual(
      files,
      [
        'master.m3u8',
        ...['360p', '480p', '720p'].flatMap((name) => [
          `${name}.m3u8`,
          `${name}0.ts`,
          `${name}1.ts`,
          `${name}2.ts`,
        ]),
      ].sort(),
    );
    assert.ok(files.every((file) => servedByBackend.test(file)));
    assert.equal(
      await readFile(path.join(output, 'master.m3u8'), 'utf8'),
      expectedMaster,
    );
    assert.deepEqual(await ffprobeStreams(path.join(output, 'master.m3u8')), [
      'aac 48000',
      'aac 48000',
      'aac 48000',
      'h264 1280x720',
      'h264 640x360',
      'h264 854x480',
    ]);
    for (const variant of HLS_VARIANTS) {
      const playlist = await readFile(
        path.join(output, `${variant.name}.m3u8`),
        'utf8',
      );
      for (const tag of [
        '#EXT-X-TARGETDURATION:5',
        '#EXT-X-PLAYLIST-TYPE:VOD',
        '#EXT-X-INDEPENDENT-SEGMENTS',
        '#EXT-X-ENDLIST',
      ])
        assert.ok(playlist.includes(tag), `${variant.name}: ${tag}`);
      assert.deepEqual(
        playlist.split('\n').filter((line) => line && !line.startsWith('#')),
        [0, 1, 2].map((index) => `${variant.name}${index}.ts`),
      );
      assert.deepEqual(
        await ffprobeStreams(path.join(output, `${variant.name}.m3u8`)),
        ['aac 48000', `h264 ${variant.resolution}`],
      );
    }
    // ABR: every rendition is cut at the same keyframes (5 s segments), so a
    // player switching quality between two segments stays continuous.
    const segmentDurations = await Promise.all(
      HLS_VARIANTS.map(async (variant) =>
        (await readFile(path.join(output, `${variant.name}.m3u8`), 'utf8'))
          .split('\n')
          .filter((line) => line.startsWith('#EXTINF:')),
      ),
    );
    assert.equal(segmentDurations[0].length, 3);
    for (const durations of segmentDurations.slice(1))
      assert.deepEqual(durations, segmentDurations[0]);
    assert.deepEqual(
      segmentDurations[0]
        .slice(0, 2)
        .map((line) => Number.parseFloat(line.slice(8))),
      [5, 5],
    );
  });
});

test('a source without audio produces video-only renditions in the same layout', async () => {
  await withDirectory(async (directory) => {
    const input = path.join(directory, 'input.mp4');
    const output = path.join(directory, 'hls');
    await mkdir(output);
    await clip(input, false, 6);
    const service = new TranscodingService({} as S3Client);
    assert.equal(await service.hasAudio(input), false);
    await service.transcodeVideoHLS(input, output);
    assert.deepEqual(
      (await readdir(output)).sort(),
      [
        'master.m3u8',
        ...['360p', '480p', '720p'].flatMap((name) => [
          `${name}.m3u8`,
          `${name}0.ts`,
          `${name}1.ts`,
        ]),
      ].sort(),
    );
    assert.equal(
      await readFile(path.join(output, 'master.m3u8'), 'utf8'),
      expectedMaster,
    );
    for (const variant of HLS_VARIANTS)
      assert.deepEqual(
        await ffprobeStreams(path.join(output, `${variant.name}.m3u8`)),
        [`h264 ${variant.resolution}`],
      );
  });
});

test('a subtitle track in the source never reaches the HLS renditions', async () => {
  await withDirectory(async (directory) => {
    const plain = path.join(directory, 'plain.mp4');
    const srt = path.join(directory, 'track.srt');
    const input = path.join(directory, 'input.mp4');
    const output = path.join(directory, 'hls');
    await mkdir(output);
    await clip(plain, true, 2);
    await writeFile(srt, '1\n00:00:00,000 --> 00:00:01,500\nHello\n');
    await ffmpeg(
      '-i',
      plain,
      '-i',
      srt,
      '-map',
      '0',
      '-map',
      '1',
      '-c',
      'copy',
      '-c:s',
      'mov_text',
      input,
    );
    await new TranscodingService({} as S3Client).transcodeVideoHLS(
      input,
      output,
    );
    assert.deepEqual(
      (await readdir(output)).sort(),
      [
        'master.m3u8',
        ...['360p', '480p', '720p'].flatMap((name) => [
          `${name}.m3u8`,
          `${name}0.ts`,
        ]),
      ].sort(),
    );
  });
});

test('an abort kills the single FFmpeg process and rejects the encode', async (t) => {
  await withDirectory(async (directory) => {
    const input = path.join(directory, 'input.mp4');
    const output = path.join(directory, 'hls');
    await mkdir(output);
    await clip(input, true, 60);
    const spawns = await recordFfmpegSpawns(t, directory);
    const controller = new AbortController();
    const encode = new TranscodingService(
      {} as S3Client,
      controller.signal,
    ).transcodeVideoHLS(input, output);
    while ((await spawns()).length === 0) await sleep(20);
    await sleep(300);
    controller.abort();
    await assert.rejects(encode, { name: 'AbortError' });
    const recorded = await spawns();
    assert.equal(recorded.length, 1, 'a single FFmpeg process');
    assert.throws(() => process.kill(recorded[0].pid, 0), { code: 'ESRCH' });
    // Killed mid-encode: no complete rendition, no master.
    assert.doesNotMatch(
      await readFile(path.join(output, '720p.m3u8'), 'utf8').catch(() => ''),
      /#EXT-X-ENDLIST/,
    );
    await assert.rejects(stat(path.join(output, 'master.m3u8')), {
      code: 'ENOENT',
    });
  });
});

test('an invalid TRANSCODING_UPLOAD_CONCURRENCY fails the job before encoding', async (t) => {
  setEnv(t, 'TRANSCODING_UPLOAD_CONCURRENCY', '0');
  t.mock.method(
    TranscodingService.prototype as unknown as Uploads,
    'uploadFile',
    async () => {},
  );
  const encode = t.mock.method(
    TranscodingService.prototype,
    'transcodeVideoHLS',
    async () => {},
  );
  t.mock.method(console, 'error', () => {});
  let encodingStarted = false;
  await withDirectory(async (directory) => {
    const input = path.join(directory, 'input.mp4');
    await clip(input);
    const result = await new TranscodingService(
      {} as S3Client,
      undefined,
      () => (encodingStarted = true),
    ).processJob(fixtureJob, input, undefined, undefined, true);
    assert.equal(result.success, false);
    assert.match(result.error || '', /Invalid TRANSCODING_UPLOAD_CONCURRENCY/);
    // A configuration error is not the source's fault: retryable.
    assert.equal(result.permanent, undefined);
    assert.equal(encode.mock.callCount(), 0);
    assert.equal(encodingStarted, false);
  });
});
