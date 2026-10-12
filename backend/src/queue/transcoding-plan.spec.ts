import sharp = require('sharp');
import { planVideoMedia, prepareMiniature } from './transcoding-plan';

describe('Video media layout with and without transcoding', () => {
  const id = 'video';
  const source = 'video/source/original.mov';

  it('stores attachments as worker inputs and waits for HLS when transcoding', () => {
    expect(
      planVideoMedia(id, source, true, { miniature: true, subtitle: true }),
    ).toEqual({
      media_id: 'video/master.m3u8',
      transcoding_status: 'pending',
      miniature_id: 'miniature-video.jpg',
      miniatureKey: 'video/source/miniature-original',
      subtitle_id: 'subtitle-video.vtt',
      subtitleKey: 'video/source/subtitle-video.vtt',
    });
  });

  it('plays the source and stores final attachments when transcoding is disabled', () => {
    expect(
      planVideoMedia(id, source, false, { miniature: true, subtitle: true }),
    ).toEqual({
      media_id: source,
      transcoding_status: 'ready',
      miniature_id: 'miniature-video.jpg',
      miniatureKey: 'miniature-video.jpg',
      subtitle_id: 'subtitle-video.vtt',
      subtitleKey: 'subtitle-video.vtt',
    });
  });

  it.each([true, false])(
    'keeps the default miniature id without attachments (transcode=%p)',
    (transcode) => {
      const plan = planVideoMedia(id, source, transcode);
      expect(plan.miniature_id).toBe('miniature-video.jpg');
      expect(plan.miniatureKey).toBeUndefined();
      expect(plan.subtitle_id).toBeUndefined();
      expect(plan.subtitleKey).toBeUndefined();
    },
  );
});

describe('Uploaded miniature with and without transcoding', () => {
  const png = () =>
    sharp({
      create: { width: 8, height: 8, channels: 3, background: '#00ccff' },
    })
      .png()
      .toBuffer();
  const html = {
    buffer: Buffer.from('<script>alert(document.domain)</script>'),
    mimetype: 'text/html',
  };

  it('keeps the upload as the worker input when transcoding', async () => {
    expect(await prepareMiniature(html, true)).toEqual({
      body: html.buffer,
      contentType: 'text/html',
    });
  });

  it('publishes the worker rendition, a 1280x720 JPEG, when transcoding is disabled', async () => {
    const stored = await prepareMiniature(
      { buffer: await png(), mimetype: 'image/png' },
      false,
    );
    expect(stored.contentType).toBe('image/jpeg');
    expect(await sharp(stored.body).metadata()).toMatchObject({
      format: 'jpeg',
      width: 1280,
      height: 720,
    });
  });

  it('rasterizes an SVG instead of publishing its markup', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><script>alert(1)</script><rect width="8" height="8" fill="red"/></svg>',
    );
    const stored = await prepareMiniature(
      { buffer: svg, mimetype: 'image/svg+xml' },
      false,
    );
    expect(stored.contentType).toBe('image/jpeg');
    expect(stored.body.includes('<script')).toBe(false);
  });

  it('drops an oversized image without decoding it', async () => {
    // 40 MP limit: a cheap solid PNG whose decode would still cost ~120 MB.
    const huge = await sharp({
      create: { width: 8000, height: 5001, channels: 3, background: '#000' },
    })
      .png()
      .toBuffer();
    expect(
      await prepareMiniature({ buffer: huge, mimetype: 'image/png' }, false),
    ).toBeUndefined();
  });

  it.each([
    ['an HTML page', html],
    ['a PDF', { buffer: Buffer.from('%PDF-1.7\n'), mimetype: 'image/png' }],
  ])(
    'publishes nothing for %s when transcoding is disabled',
    async (_, file) => {
      expect(await prepareMiniature(file, false)).toBeUndefined();
    },
  );

  it.each([true, false])(
    'has nothing to store without a miniature (transcode=%p)',
    async (transcode) => {
      expect(await prepareMiniature(undefined, transcode)).toBeUndefined();
    },
  );
});
