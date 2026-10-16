import i18n from '../testUtils/i18nForTests';
import {
  processingUploadUpdate,
  uploadCompletedUpdate,
} from './uploadProcessing';

const t = i18n.t.bind(i18n);

describe('uploadCompletedUpdate', () => {
  it('keeps the created video id and waits for processing instead of claiming success', () => {
    expect(uploadCompletedUpdate({ id: 'video-1' })).toEqual({
      progress: 100,
      status: 'processing',
      videoId: 'video-1',
      errorMessage: undefined,
    });
  });

  it('falls back to the upload session id, which is also the video id', () => {
    expect(uploadCompletedUpdate(undefined, 'session-1')).toMatchObject({
      status: 'processing',
      videoId: 'session-1',
    });
    expect(
      uploadCompletedUpdate({} as { id: string }, 'session-1'),
    ).toMatchObject({ videoId: 'session-1' });
  });
});

describe('processingUploadUpdate', () => {
  const status = (state: string, reason: string | null = null) => ({
    state: state as 'queued',
    since: null,
    reason,
    playedFromSource: false,
  });

  it('completes the upload once the video is ready', () => {
    expect(processingUploadUpdate(status('ready'), t)).toEqual({
      status: 'completed',
      progress: 100,
      errorMessage: undefined,
    });
  });

  it('fails the upload with a plain explanation, never a technical error', () => {
    expect(
      processingUploadUpdate(status('failed', 'source_too_large'), t),
    ).toEqual({
      status: 'error',
      progress: 100,
      errorMessage:
        'Le fichier envoyé est trop volumineux. Compressez la vidéo (ou réduisez sa résolution), puis publiez-la à nouveau.',
    });
    expect(
      processingUploadUpdate(status('failed', 'ffmpeg: moov atom'), t)
        ?.errorMessage,
    ).toBe(
      'Un problème temporaire a empêché la préparation de la vidéo. Publiez-la à nouveau, ou contactez le support si le problème persiste.',
    );
  });

  it('keeps waiting while queued, processing or retrying', () => {
    expect(processingUploadUpdate(status('queued'), t)).toBeNull();
    expect(processingUploadUpdate(status('processing'), t)).toBeNull();
    expect(processingUploadUpdate(status('retrying'), t)).toBeNull();
  });
});
