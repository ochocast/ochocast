import { CommentObject } from 'src/comments/domain/comment';
import { ICommentGateway } from 'src/comments/domain/gateways/comments.gateway';
import { CreateNewCommentUsecase } from 'src/comments/domain/usecases/createNewComment.usecase';
import { CreateCommentDto } from 'src/comments/infra/controllers/dto/create-comment.dto';
import { UserEntity } from 'src/users/infra/gateways/entities/user.entity';
import { VideoEntity } from 'src/videos/infra/gateways/entities/video.entity';

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

describe('CreateNewCommentUsecase', () => {
  let usecase: CreateNewCommentUsecase;
  let mockCommentGateway: jest.Mocked<ICommentGateway>;

  const mockUser = { id: 'user1' } as UserEntity;
  const mockVideo = { id: 'video1' } as VideoEntity;

  beforeEach(() => {
    mockCommentGateway = {
      createNewComment: jest.fn(),
      getComments: jest.fn(),
      deleteComment: jest.fn(),
      likeComment: jest.fn(),
      deletelikeComment: jest.fn(),
    };

    usecase = new CreateNewCommentUsecase(mockCommentGateway);
  });

  it('should create and return a new comment', async () => {
    const dto: CreateCommentDto = {
      content: 'Super vidéo !',
      creator: mockUser,
      video: mockVideo,
    };

    const result = await usecase.execute(dto);

    expect(result).toBeInstanceOf(CommentObject);
    expect(result).toMatchObject({
      id: 'mock-uuid',
      content: 'Super vidéo !',
      creator: mockUser,
      video: mockVideo,
    });

    expect(mockCommentGateway.createNewComment).toHaveBeenCalledWith(result);
  });
});
