import { api, getVideoProcessing, publicApi } from './api';

describe('getVideoProcessing', () => {
  afterEach(() => jest.restoreAllMocks());

  it('asks the public processing endpoint, so anonymous visitors can poll', async () => {
    const response = { ok: true, status: 200, data: { state: 'queued' } };
    const publicGet = jest
      .spyOn(publicApi, 'get')
      .mockResolvedValue(response as never);
    const authenticatedGet = jest.spyOn(api, 'get');

    await expect(getVideoProcessing('video-1')).resolves.toBe(response);
    expect(publicGet).toHaveBeenCalledWith('/videos/video-1/processing');
    expect(authenticatedGet).not.toHaveBeenCalled();
  });

  it('encodes the id into the path', async () => {
    const publicGet = jest
      .spyOn(publicApi, 'get')
      .mockResolvedValue({ ok: false, status: 404 } as never);

    await getVideoProcessing('a/b?c');
    expect(publicGet).toHaveBeenCalledWith('/videos/a%2Fb%3Fc/processing');
  });
});
