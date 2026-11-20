import { api } from './api';
import { getTranscript, searchContent } from './searchApi';

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
  });
});
