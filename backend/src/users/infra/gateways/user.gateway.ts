import { IUserGateway } from '../../domain/gateways/users.gateway';
import { UserObject } from '../../domain/user';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { UserEntity } from './entities/user.entity';
import { toEventEntity } from 'src/common/mapper/event.mapper';
import { toUserObject } from 'src/common/mapper/user.mapper';
import { VideoObject } from 'src/videos/domain/video';
import { CommentObject } from 'src/comments/domain/comment';

export class UserGateway implements IUserGateway {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
  ) {}

  async createNewUser(userDetails: UserObject): Promise<UserObject> {
    console.table('\n\n\n\n\n\n\n\n' + userDetails);
    const user: UserEntity = new UserEntity({
      ...userDetails,
      events: userDetails.events?.map(toEventEntity),
    });

    return toUserObject(await this.usersRepository.save(user));
  }

  getUsers(filter: any): Promise<UserObject[]> {
    return this.usersRepository
      .find({
        where: {
          ...filter,
        },
        relations: filter.id ? ['events'] : [],
      })
      .then((entities) => entities.map(toUserObject));
  }

  getListUsers(filter: any): Promise<UserObject[]> {
    const where: any = {};
    where.firstName = ILike(`%${filter.value}%`);
    where.lastName = ILike(`%${filter.value}%`);

    return this.usersRepository
      .find({
        where,
        relations: filter.id ? ['events'] : [],
      })
      .then((entities) => entities.map(toUserObject));
  }

  async loginUser(keycloak_user: any): Promise<UserObject> {
    let user: UserObject | null = null;

    const foundUser = await this.usersRepository.findOne({
      where: {
        email: keycloak_user.email,
      },
      relations: ['events'],
    });

    if (foundUser) {
      // Persist the real username from the identity provider if missing or changed
      const newUsername =
        keycloak_user.username ?? keycloak_user.preferred_username;
      if (newUsername && foundUser.username !== newUsername) {
        await this.usersRepository.update(foundUser.id, {
          username: newUsername,
        });
        foundUser.username = newUsername as string;
      }
      user = toUserObject(foundUser);
    } else {
      console.table(keycloak_user);
      user = await this.createNewUser(keycloak_user);
    }

    return user;
  }

  async getUserByEmail(email: string): Promise<UserObject | null> {
    const user = await this.usersRepository.findOne({
      where: { email },
      relations: ['events'],
    });

    return user ? toUserObject(user) : null;
  }

  async getUserById(id: string): Promise<UserObject | null> {
    const user = await this.usersRepository.findOne({
      where: { id },
      relations: ['events'],
    });

    return user ? toUserObject(user) : null;
  }

  async addFavoriteVideo(userId: string, videoId: string): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new Error('User not found');
    await this.usersRepository
      .createQueryBuilder()
      .relation(UserEntity, 'favoriteVideos')
      .of(userId)
      .add(videoId);
  }

  async removeFavoriteVideo(userId: string, videoId: string): Promise<void> {
    await this.usersRepository
      .createQueryBuilder()
      .relation(UserEntity, 'favoriteVideos')
      .of(userId)
      .remove(videoId);
  }

  async isVideoFavorite(userId: string, videoId: string): Promise<boolean> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      relations: ['favoriteVideos'],
    });
    return !!user?.favoriteVideos.some((video) => video.id === videoId);
  }

  async getFavoriteVideos(email: string): Promise<VideoObject[]> {
    const user = await this.usersRepository.findOne({
      where: { email },
      relations: [
        'favoriteVideos',
        'favoriteVideos.tags',
        'favoriteVideos.creator',
        'favoriteVideos.comments',
      ],
    });

    if (!user) throw new Error('User not found');

    if (!user.favoriteVideos) return [];

    return user.favoriteVideos.map((video) => ({
      ...video,
      creator: video.creator,
      tags: video.tags,
      comments: video.comments,
    }));
  }
  async updateUserProfile(
    userId: string,
    newUserName: string,
    newDescription: string,
    newProfilePictureId: string,
  ): Promise<void> {
    if (newUserName) {
      await this.usersRepository.update(userId, {
        username: newUserName || 'Pas de nom',
        description: newDescription || '',
        picture_id: newProfilePictureId || '',
      });
    } else {
      await this.usersRepository.update(userId, {
        description: newDescription || '',
        picture_id: newProfilePictureId || '',
      });
    }
  }

  async addLikedComment(userId: string, commentId: string): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new Error('User not found');
    await this.usersRepository
      .createQueryBuilder()
      .relation(UserEntity, 'likedComments')
      .of(userId)
      .add(commentId);
  }

  async removeLikedComment(userId: string, commentId: string): Promise<void> {
    await this.usersRepository
      .createQueryBuilder()
      .relation(UserEntity, 'likedComments')
      .of(userId)
      .remove(commentId);
  }

  async getLikedComment(email: string): Promise<CommentObject[]> {
    const user = await this.usersRepository.findOne({
      where: { email },
      relations: ['likedComments'],
    });

    if (!user) throw new Error('User not found');

    if (!user.likedComments) return [];

    return user.likedComments;
  }
}
