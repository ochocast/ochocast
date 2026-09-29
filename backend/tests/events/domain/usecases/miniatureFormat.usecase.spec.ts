import { CreateNewVideoUsecase } from 'src/videos/domain/usecases/createNewVideo.usecase';

describe('live recording upload compatibility', () => {
  it('passes the disk-backed recording and metadata through the persistent multipart path', async () => {
    const uploads = { importRecording: jest.fn().mockResolvedValue({ id: 'video' }) };
    const service = new CreateNewVideoUsecase(uploads as any);
    const file = { path: '/tmp/recording', originalname: 'recording.mp4' } as Express.Multer.File;
    expect(await service.execute({ creator: { email: 'owner@example.test' }, title: 'Live', tags: [] } as any, file)).toEqual({ id: 'video' });
    expect(uploads.importRecording).toHaveBeenCalledWith('owner@example.test', file, expect.objectContaining({ title: 'Live', tags: '[]' }));
  });
});
