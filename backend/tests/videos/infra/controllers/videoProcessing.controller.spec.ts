import { INestApplication, NotFoundException, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { META_PUBLIC } from 'nest-keycloak-connect';
import request = require('supertest');
import { VideosModule } from 'src/videos/videos.module';
import { VideosController } from 'src/videos/infra/controllers/videos.controller';
import { VideoProcessingController } from 'src/videos/infra/controllers/videoProcessing.controller';
import { GetVideoProcessingUsecase } from 'src/videos/domain/usecases/getVideoProcessing.usecase';
import { searchVideoUseCase } from 'src/videos/domain/usecases/searchVideo.usecase';

describe('GET /api/videos/:id/processing', () => {
  const id = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
  const processing = { execute: jest.fn() };
  const search = { execute: jest.fn(async () => []) };
  let app: INestApplication;

  beforeAll(async () => {
    // The controllers of the real module, in its order: routes are matched in
    // registration order, so a static two-segment route must keep winning.
    const controllers = Reflect.getMetadata('controllers', VideosModule);
    const dependencies: Type[] = Reflect.getMetadata(
      'design:paramtypes',
      VideosController,
    );
    const module = await Test.createTestingModule({
      controllers,
      providers: [
        ...dependencies.map((provide) => ({
          provide,
          useValue: provide === searchVideoUseCase ? search : {},
        })),
        { provide: GetVideoProcessingUsecase, useValue: processing },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    processing.execute.mockReset();
    search.execute.mockClear();
  });

  it('is public, for anonymous visitors too', () => {
    expect(
      Reflect.getMetadata(
        META_PUBLIC,
        VideoProcessingController.prototype.getProcessing,
      ),
    ).toBe(true);
  });

  it('returns the processing state, never cached', async () => {
    const body = {
      state: 'processing',
      since: '2026-10-16T11:50:00.000Z',
      reason: null,
      playedFromSource: false,
    };
    processing.execute.mockResolvedValue(body);
    const response = await request(app.getHttpServer())
      .get(`/api/videos/${id}/processing`)
      .expect(200);
    expect(response.body).toEqual(body);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(processing.execute).toHaveBeenCalledWith(id);
  });

  it('answers 404 for a missing or archived video', async () => {
    processing.execute.mockRejectedValue(
      new NotFoundException('Video not found'),
    );
    await request(app.getHttpServer())
      .get(`/api/videos/${id}/processing`)
      .expect(404);
    expect(processing.execute).toHaveBeenCalledWith(id);
  });

  it('answers 400 for an id that is not a UUID', async () => {
    await request(app.getHttpServer())
      .get('/api/videos/not-a-uuid/processing')
      .expect(400);
    expect(processing.execute).not.toHaveBeenCalled();
  });

  it('leaves a search for the word processing to the search route', async () => {
    await request(app.getHttpServer())
      .get('/api/videos/searchvideo/processing')
      .expect(200);
    expect(search.execute).toHaveBeenCalledWith('processing');
    expect(processing.execute).not.toHaveBeenCalled();
  });
});
