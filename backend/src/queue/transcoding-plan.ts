import sharp = require('sharp');

// Every source is stored and served with the type of its extension, never a
// type supplied by the client.
export const VIDEO_CONTENT_TYPES = new Map([
  ['avi', 'video/x-msvideo'],
  ['m4v', 'video/x-m4v'],
  ['mkv', 'video/x-matroska'],
  ['mov', 'video/quicktime'],
  ['mp4', 'video/mp4'],
  ['ogg', 'video/ogg'],
  ['webm', 'video/webm'],
]);

// Containers browsers play natively. Without transcoding only these are
// accepted, since the source itself is published.
export const PLAYABLE_AS_IS = new Set(['m4v', 'mov', 'mp4', 'webm']);

export interface VideoMediaPlan {
  media_id: string;
  transcoding_status: 'pending' | 'ready';
  miniature_id: string;
  /** Where the uploaded miniature is stored, if any. */
  miniatureKey?: string;
  subtitle_id?: string;
  /** Where the normalized subtitle is stored, if any. */
  subtitleKey?: string;
}

// Shared by multipart uploads and recording publication so both write the
// layout that playback, the worker and permanent deletion expect.
export function planVideoMedia(
  videoId: string,
  originalKey: string,
  transcode: boolean,
  attachments: { miniature?: boolean; subtitle?: boolean } = {},
): VideoMediaPlan {
  const miniature_id = `miniature-${videoId}.jpg`;
  const subtitle_id = attachments.subtitle
    ? `subtitle-${videoId}.vtt`
    : undefined;
  if (!transcode)
    // No queue: the source is played as is and attachments are final objects.
    return {
      media_id: originalKey,
      transcoding_status: 'ready',
      miniature_id,
      miniatureKey: attachments.miniature ? miniature_id : undefined,
      subtitle_id,
      subtitleKey: subtitle_id,
    };
  // The worker reads these sources and writes HLS and the final attachments.
  return {
    media_id: `${videoId}/master.m3u8`,
    transcoding_status: 'pending',
    miniature_id,
    miniatureKey: attachments.miniature
      ? `${videoId}/source/miniature-original`
      : undefined,
    subtitle_id,
    subtitleKey: subtitle_id ? `${videoId}/source/${subtitle_id}` : undefined,
  };
}

/**
 * The miniature object to store. The worker re-encodes its source copy;
 * without it the backend stores the same rendition, so a served miniature is
 * always a JPEG, never the client's bytes or type. Like the worker, a file
 * that is not an image is dropped rather than failing the upload.
 */
export async function prepareMiniature(
  file: { buffer: Buffer; mimetype?: string } | undefined,
  transcode: boolean,
): Promise<{ body: Buffer; contentType: string } | undefined> {
  if (!file) return undefined;
  if (transcode)
    return {
      body: file.buffer,
      contentType: file.mimetype || 'application/octet-stream',
    };
  try {
    // Far above any thumbnail; larger inputs are rejected from their header.
    const body = await sharp(file.buffer, { limitInputPixels: 40_000_000 })
      .resize(1280, 720, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 80 })
      .toBuffer();
    return { body, contentType: 'image/jpeg' };
  } catch {
    return undefined;
  }
}
