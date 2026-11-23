import { api } from './api';
import { getTranscript, SearchApiError, searchContent } from './searchApi';

jest.mock('./api', () => ({ api: { get: jest.fn() } }));

const get = api.get as jest.Mock;

describe('searchApi', () => {
  describe('searchContent', () => {
    it('sends only the non-empty params and returns the data', async () => {
      const data = { query: 'kube', total: 0, passageTotal: 0, videos: [] };
      get.mockResolvedValue({ ok: true, status: 200, data });

      const result = await searchContent({
        q: 'kube',
        tags: '',
        users: undefined,
        favoris: false,
        limit: 20,
        offset: 0,
      });

      expect(get).toHaveBeenCalledWith('/search', {
        q: 'kube',
        favoris: false,
        limit: 20,
        offset: 0,
      });
      expect(result).toBe(data);
    });

    it('throws an error carrying the HTTP status', async () => {
      get.mockResolvedValue({ ok: false, status: 503, data: null });

      await expect(searchContent({ q: 'kube' })).rejects.toMatchObject({
        status: 503,
      });
    });
  });

  describe('getTranscript', () => {
    it('encodes the video id and leaves out an empty q', async () => {
      get.mockResolvedValue({ ok: true, status: 200, data: { videoId: 'a' } });

      await getTranscript('a/b');
      await getTranscript('a/b', '');
      await getTranscript('a/b', 'kube');

      expect(get).toHaveBeenNthCalledWith(1, '/videos/a%2Fb/transcript', {});
      expect(get).toHaveBeenNthCalledWith(2, '/videos/a%2Fb/transcript', {});
      expect(get).toHaveBeenNthCalledWith(3, '/videos/a%2Fb/transcript', {
        q: 'kube',
      });
    });

    it('throws an error carrying the HTTP status', async () => {
      get.mockResolvedValue({ ok: false, status: 404, data: null });

      await expect(getTranscript('x')).rejects.toMatchObject({ status: 404 });
    });

    it('returns a well-formed transcript unchanged', async () => {
      const data = {
        videoId: 'k8s',
        source: 'provided',
        status: 'ready',
        segments: [
          { start: 12, end: 17.5, parts: [{ text: 'Bonjour', hit: false }] },
          {
            start: 95.25,
            end: 100,
            parts: [
              { text: 'On a choisi ', hit: false },
              { text: 'Kubernetes', hit: true },
            ],
          },
        ],
        matches: [1],
      };
      get.mockResolvedValue({ ok: true, status: 200, data });

      await expect(getTranscript('k8s', 'kube')).resolves.toEqual(data);
    });

    it.each([
      ['null', null],
      ['a string', '<html>Bad gateway</html>'],
      ['an array', [{ start: 1 }]],
    ])(
      'treats %s as a failure carrying the HTTP status',
      async (_label, data) => {
        get.mockResolvedValue({ ok: true, status: 200, data });

        const error = await getTranscript('k8s').catch((e: unknown) => e);

        expect(error).toBeInstanceOf(SearchApiError);
        expect(error).toMatchObject({ status: 200 });
      },
    );

    it('normalises a malformed transcript', async () => {
      get.mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          videoId: 42,
          source: 'whisper',
          status: 'ready',
          segments: [
            { start: 12, end: 'later', parts: [{ text: 'Bonjour', hit: 1 }] },
            null,
            { start: '95', end: 100, parts: [] },
            { start: Number.NaN },
            { start: 260, text: 'Le cluster', parts: 'Le cluster' },
            {
              start: 498.5,
              end: 503,
              parts: [
                { text: 'Le ', hit: false },
                { text: 7, hit: true },
                null,
                { text: 'transcodage', hit: true },
              ],
            },
            { start: 754, text: 12 },
            { start: 1012, parts: [{ hit: true }], text: 'Kubernetes' },
          ],
          // Raw indexes: 5 is the 3rd kept segment, 7 the 5th; 2 and 3 were
          // dropped.
          matches: [7, 5, 5, 2, 3, -1, 1.5, '4', 99],
        },
      });

      await expect(getTranscript('k8s', 'kube')).resolves.toEqual({
        videoId: 'k8s',
        source: 'auto',
        status: 'ready',
        segments: [
          { start: 12, end: 12, parts: [{ text: 'Bonjour', hit: false }] },
          {
            start: 260,
            end: 260,
            parts: [{ text: 'Le cluster', hit: false }],
          },
          {
            start: 498.5,
            end: 503,
            parts: [
              { text: 'Le ', hit: false },
              { text: 'transcodage', hit: true },
            ],
          },
          { start: 754, end: 754, parts: [{ text: '', hit: false }] },
          {
            start: 1012,
            end: 1012,
            parts: [{ text: 'Kubernetes', hit: false }],
          },
        ],
        matches: [2, 4],
      });
    });

    it('defaults a missing segment list and match list to empty', async () => {
      get.mockResolvedValue({
        ok: true,
        status: 200,
        data: { status: 'ready', segments: 'none', matches: null },
      });

      await expect(getTranscript('k8s')).resolves.toEqual({
        videoId: 'k8s',
        source: 'auto',
        status: 'ready',
        segments: [],
        matches: [],
      });
    });

    it('keeps no segment and no match unless the transcript is ready', async () => {
      const segments = [
        { start: 12, end: 17, parts: [{ text: 'a', hit: true }] },
      ];
      get
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          data: { status: 'pending', segments, matches: [0] },
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          data: { status: 'unknown', segments, matches: [0] },
        });

      await expect(getTranscript('k8s')).resolves.toMatchObject({
        status: 'pending',
        segments: [],
        matches: [],
      });
      await expect(getTranscript('k8s')).resolves.toMatchObject({
        status: 'none',
        segments: [],
        matches: [],
      });
    });
  });
});
