import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CreateVideoEditUsecase } from 'src/video-edits/domain/usecases/createVideoEdit.usecase';
import { GetVideoEditUsecase } from 'src/video-edits/domain/usecases/getVideoEdit.usecase';
import { SaveVideoEditUsecase } from 'src/video-edits/domain/usecases/saveVideoEdit.usecase';
import { RevertVideoEditUsecase } from 'src/video-edits/domain/usecases/revertVideoEdit.usecase';
import {
  SegmentInput,
  VideoEditObject,
} from 'src/video-edits/domain/videoEdit';

describe('Video edit use cases', () => {
  const videoId = 'ad1b1aa3-d2b3-4041-bfe9-a511bcbe27a2';
  const creator = {
    id: 'creator-id',
    email: 'creator@example.com',
    role: 'user',
  };
  const admin = { id: 'admin-id', email: 'admin@example.com', role: 'admin' };
  const stranger = {
    id: 'stranger-id',
    email: 'nobody@example.com',
    role: 'user',
  };
  const users = [creator, admin, stranger];

  const segments: SegmentInput[] = [
    {
      sourceStart: 120,
      sourceEnd: 870,
      textLayers: [
        {
          content: 'Ouverture',
          position: 'bottom',
          color: 'white',
          startOffset: 0,
          duration: 300,
        },
      ],
    },
    { sourceStart: 1270, sourceEnd: 2205, textLayers: [] },
  ];

  const edit = (overrides: Partial<VideoEditObject> = {}): VideoEditObject => ({
    id: 'edit-id',
    videoId,
    renderStatus: 'draft',
    renderError: null,
    renderedMediaId: null,
    renderedDuration: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    segments: [],
    ...overrides,
  });

  let video: any;
  let videoGateway: { getVideos: jest.Mock };
  let userGateway: { getUserByEmail: jest.Mock };
  let editGateway: {
    findByVideoId: jest.Mock;
    create: jest.Mock;
    replaceContent: jest.Mock;
    abortRender: jest.Mock;
    findSourceKey: jest.Mock;
  };
  let dispatcher: { enabled: boolean; publish: jest.Mock };

  beforeEach(() => {
    video = {
      id: videoId,
      creator,
      duration: 3012,
      transcoding_status: 'ready',
    };
    videoGateway = {
      getVideos: jest
        .fn()
        .mockImplementation(async ({ id }) => (id === videoId ? [video] : [])),
    };
    userGateway = {
      getUserByEmail: jest
        .fn()
        .mockImplementation(
          async (email: string) => users.find((u) => u.email === email) ?? null,
        ),
    };
    editGateway = {
      findByVideoId: jest.fn().mockResolvedValue(edit()),
      create: jest
        .fn()
        .mockImplementation(async (_id, segs) => edit({ segments: segs })),
      replaceContent: jest.fn().mockResolvedValue({
        status: 'ok',
        edit: edit({ version: 2, renderStatus: 'pending' }),
      }),
      abortRender: jest.fn(),
      findSourceKey: jest
        .fn()
        .mockResolvedValue(`${videoId}/source/original.mp4`),
    };
    dispatcher = { enabled: true, publish: jest.fn() };
  });

  const create = () =>
    new CreateVideoEditUsecase(
      editGateway as any,
      videoGateway as any,
      userGateway as any,
    );
  const get = () =>
    new GetVideoEditUsecase(
      editGateway as any,
      videoGateway as any,
      userGateway as any,
    );
  const save = () =>
    new SaveVideoEditUsecase(
      editGateway as any,
      dispatcher,
      videoGateway as any,
      userGateway as any,
    );
  const revert = () =>
    new RevertVideoEditUsecase(
      editGateway as any,
      videoGateway as any,
      userGateway as any,
    );

  describe('access', () => {
    it('lets the creator and admins edit', async () => {
      await expect(
        get().execute(videoId, creator.email),
      ).resolves.toBeDefined();
      await expect(get().execute(videoId, admin.email)).resolves.toBeDefined();
    });

    it('answers 403 to anyone else', async () => {
      await expect(get().execute(videoId, stranger.email)).rejects.toThrow(
        ForbiddenException,
      );
      expect(editGateway.findByVideoId).not.toHaveBeenCalled();
    });

    it('answers 404 for an unknown user or video', async () => {
      await expect(get().execute(videoId, 'ghost@example.com')).rejects.toThrow(
        NotFoundException,
      );
      await expect(
        get().execute('00000000-0000-4000-8000-000000000000', creator.email),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('starts from one segment covering the whole video', async () => {
      const created = await create().execute(videoId, creator.email);
      expect(editGateway.create).toHaveBeenCalledWith(videoId, [
        { sourceStart: 0, sourceEnd: 3012, textLayers: [] },
      ]);
      expect(created.renderStatus).toBe('draft');
    });

    it.each([
      ['not processed yet', { transcoding_status: 'pending' }],
      ['failed', { transcoding_status: 'failed' }],
      ['of unknown duration', { duration: null }],
      ['shorter than a segment', { duration: 0.5 }],
    ])('refuses a video %s with 409', async (_, overrides) => {
      Object.assign(video, overrides);
      await expect(create().execute(videoId, creator.email)).rejects.toThrow(
        ConflictException,
      );
      expect(editGateway.create).not.toHaveBeenCalled();
    });

    it('refuses a video whose original is not kept with 409', async () => {
      editGateway.findSourceKey.mockResolvedValue(null);
      await expect(create().execute(videoId, creator.email)).rejects.toThrow(
        'The original file of this video is not kept',
      );
      expect(editGateway.findSourceKey).toHaveBeenCalledWith(
        videoId,
        video.media_id,
      );
      expect(editGateway.create).not.toHaveBeenCalled();
    });

    it('refuses a second montage with 409', async () => {
      editGateway.create.mockResolvedValue(null);
      await expect(create().execute(videoId, creator.email)).rejects.toThrow(
        'This video already has a montage',
      );
    });
  });

  describe('read', () => {
    it('answers 404 when the video has no montage', async () => {
      editGateway.findByVideoId.mockResolvedValue(null);
      await expect(get().execute(videoId, creator.email)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns the render status alone', async () => {
      editGateway.findByVideoId.mockResolvedValue(
        edit({ renderStatus: 'failed', renderError: 'boom', version: 3 }),
      );
      await expect(
        get().renderStatus(videoId, creator.email),
      ).resolves.toMatchObject({
        videoId,
        renderStatus: 'failed',
        renderError: 'boom',
        version: 3,
      });
    });
  });

  describe('save', () => {
    it('replaces the montage under its version, then asks for its render', async () => {
      const saved = await save().execute(videoId, 1, segments, creator.email);

      expect(editGateway.replaceContent).toHaveBeenCalledWith(
        videoId,
        segments,
        {
          expectedVersion: 1,
          renderStatus: 'pending',
          renderJob: {
            jobId: expect.any(String),
            sourceKey: `${videoId}/source/original.mp4`,
          },
        },
      );
      const { jobId } = editGateway.replaceContent.mock.calls[0][2].renderJob;
      // The message published is the job registered with the montage.
      expect(dispatcher.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId,
          editId: 'edit-id',
          videoId,
          version: 2,
        }),
      );
      expect(saved).toMatchObject({ version: 2, renderStatus: 'pending' });
    });

    it('refuses an invalid montage with 400 and every reason', async () => {
      const invalid = [
        { sourceStart: 0, sourceEnd: 5000, textLayers: [] },
        { sourceStart: 10, sourceEnd: 20, textLayers: [] },
      ];
      const error = await save()
        .execute(videoId, 1, invalid, creator.email)
        .catch((e) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.getResponse().message).toEqual([
        'segments[0]: sourceEnd exceeds the video duration (3012s)',
        'The edited video lasts 5010s, more than the 2700s allowed',
        'segments[1] overlaps segments[0] in the source video',
      ]);
      expect(editGateway.replaceContent).not.toHaveBeenCalled();
    });

    it('answers 503 without writing when rendering is unavailable', async () => {
      dispatcher.enabled = false;
      await expect(
        save().execute(videoId, 1, segments, creator.email),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(editGateway.replaceContent).not.toHaveBeenCalled();
    });

    it.each([
      [{ status: 'version_conflict', currentVersion: 4 }, 'current version 4'],
      [
        { status: 'render_in_progress', renderStatus: 'processing' },
        'in progress',
      ],
    ])(
      'answers 409 when the write is refused (%o)',
      async (result, message) => {
        editGateway.replaceContent.mockResolvedValue(result);
        const error = await save()
          .execute(videoId, 1, segments, creator.email)
          .catch((e) => e);
        expect(error).toBeInstanceOf(ConflictException);
        expect(error.message).toContain(message);
        expect(dispatcher.publish).not.toHaveBeenCalled();
      },
    );

    it('answers 409 without writing when the original is gone', async () => {
      editGateway.findSourceKey.mockResolvedValue(null);
      await expect(
        save().execute(videoId, 1, segments, creator.email),
      ).rejects.toThrow(ConflictException);
      expect(editGateway.replaceContent).not.toHaveBeenCalled();
    });

    it('answers 404 when the montage was never created', async () => {
      editGateway.replaceContent.mockResolvedValue({ status: 'not_found' });
      await expect(
        save().execute(videoId, 1, segments, creator.email),
      ).rejects.toThrow(NotFoundException);
    });

    it('marks the render failed when it cannot be queued', async () => {
      dispatcher.publish.mockRejectedValue(new Error('queue down'));
      await expect(
        save().execute(videoId, 1, segments, creator.email),
      ).rejects.toThrow(ServiceUnavailableException);
      const { jobId } = editGateway.replaceContent.mock.calls[0][2].renderJob;
      expect(editGateway.abortRender).toHaveBeenCalledWith(
        jobId,
        'edit-id',
        2,
        'The render could not be started',
      );
    });

    it('answers 403 before validating for a stranger', async () => {
      await expect(
        save().execute(videoId, 1, [], stranger.email),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('revert', () => {
    it('restores the original: whole video, no text, rendered version dropped', async () => {
      editGateway.replaceContent.mockResolvedValue({
        status: 'ok',
        edit: edit({ version: 3 }),
      });
      await revert().execute(videoId, admin.email);
      expect(editGateway.replaceContent).toHaveBeenCalledWith(
        videoId,
        [{ sourceStart: 0, sourceEnd: 3012, textLayers: [] }],
        { renderStatus: 'draft', clearRenderedMedia: true },
      );
    });

    it('answers 409 during a render', async () => {
      editGateway.replaceContent.mockResolvedValue({
        status: 'render_in_progress',
        renderStatus: 'pending',
      });
      await expect(revert().execute(videoId, creator.email)).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
