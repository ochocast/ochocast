import { TranscriptionApiGateway } from 'src/transcription/infra/gateways/transcription-api.gateway';

describe('TranscriptionApiGateway', () => {
  let gateway: TranscriptionApiGateway;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env.TRANSCRIPTION_API_URL = 'http://fake-api.com';
    process.env.TRANSCRIPTION_API_KEY = 'fake-key';

    gateway = new TranscriptionApiGateway();

    fetchMock = jest.fn();
    global.fetch = fetchMock as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should call the transcription API and return normalized result', async () => {
    // Mock fetch audio
    fetchMock.mockResolvedValueOnce({
      ok: true,
      blob: async () => new Blob(['fake audio']),
    });

    // Mock transcription API response
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        text: 'Bonjour le monde',
        segments: [{ start: 0, end: 2, text: 'Bonjour le monde' }],
        words: [{ start: 0, end: 2, word: 'Bonjour' }],
      }),
    });

    const result = await gateway.transcribe({
      videoId: 'video-1',
      audioUrl: 'http://s3/audio1.mp3',
      language: 'fr',
    });

    expect(result.text).toBe('Bonjour le monde');
    expect(result.vttContent).toContain('WEBVTT');
    expect(result.vttContent).toContain('Bonjour le monde');
    expect(result.words).toHaveLength(1);
  });

  it('should throw an error if audio fetch fails', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });

    await expect(
      gateway.transcribe({
        videoId: 'video-1',
        audioUrl: 'http://s3/broken.mp3',
        language: 'fr',
      }),
    ).rejects.toThrow('Failed to fetch audio for video video-1');
  });

  it('should throw an error if the transcription API responds with an error', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      blob: async () => new Blob(['fake audio']),
    });
    fetchMock.mockResolvedValueOnce({
      ok: false,
      text: async () => 'Invalid API key',
    });

    await expect(
      gateway.transcribe({
        videoId: 'video-1',
        audioUrl: 'http://s3/audio1.mp3',
        language: 'fr',
      }),
    ).rejects.toThrow('Transcription API error: Invalid API key');
  });
});
