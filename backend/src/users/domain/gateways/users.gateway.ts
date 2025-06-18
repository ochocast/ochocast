import { VideoObject } from 'src/videos/domain/video';
import { UserObject } from '../user';

export interface IUserGateway {
  createNewUser: (user: UserObject) => Promise<UserObject>;
  getUsers: (filter: any) => Promise<UserObject[]>;
  loginUser: (keycloak_user: any) => Promise<UserObject>;
  getListUsers: (filter: any) => Promise<UserObject[]>;
  getUserByEmail(email: string): Promise<UserObject | null>;
  getUserById(id: string): Promise<UserObject | null>;
  addFavoriteVideo(userId: string, videoId: string): Promise<void>;
  removeFavoriteVideo(userId: string, videoId: string): Promise<void>;
  isVideoFavorite(userId: string, videoId: string): Promise<boolean>;
  getFavoriteVideos(userId: string): Promise<VideoObject[]>;
  updateUserProfile(
    userId: string,
    newFirstName: string,
    newDescription: string,
    newProfilePictureId: string,
  ): Promise<void>;
}
