import { GetVideosUsecase } from 'src/videos/domain/usecases/getVideos.usecase';

describe('GetVideosUsecase', () => {
  const videos = () => [
    { id: 'original', duration: 3012 },
    { id: 'edited', duration: 3012 },
    { id: 'unknown', duration: null },
  ];
  const gateway = {
    getVideos: jest.fn(async () => videos()),
    getRenderedDurations: jest.fn(async () => new Map([['edited', 2195]])),
  };

  it('tells which videos viewers get edited, and how long they last', async () => {
    const result = await new GetVideosUsecase(gateway as any).execute({});

    expect(gateway.getRenderedDurations).toHaveBeenCalledWith([
      'original',
      'edited',
      'unknown',
    ]);
    expect(
      result.map(({ id, edited, renderedDuration, duration }) => ({
        id,
        edited,
        renderedDuration,
        duration,
      })),
    ).toEqual([
      { id: 'original', edited: false, renderedDuration: 3012, duration: 3012 },
      // The original's duration stays as is.
      { id: 'edited', edited: true, renderedDuration: 2195, duration: 3012 },
      { id: 'unknown', edited: false, renderedDuration: null, duration: null },
    ]);
  });
});
