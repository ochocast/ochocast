import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { CreateNewUserUsecase } from '../../domain/usecases/createNewUser.usecase';
import { LoginUserUseCase } from 'src/users/domain/usecases/loginUser.usecase';
import { GetUsersUsecase } from '../../domain/usecases/getUsers.usecase';
import { UserObject } from '../../domain/user';
import { AuthenticatedUser } from 'nest-keycloak-connect';
import { ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { GetProfilePictureUsecase } from 'src/users/domain/usecases/getProfilePicture.usecase';
import { GetListUsersUsecase } from 'src/users/domain/usecases/getListUsers.usecase';
import { AddFavoriteVideoUsecase } from 'src/users/domain/usecases/addFavoriteVideo.usecase';
import { RemoveFavoriteVideoUsecase } from 'src/users/domain/usecases/removeFavoriteVideo.usecase';
import { IsFavoriteVideoUsecase } from 'src/users/domain/usecases/isFavoriteVideo.usecase';
import { GetFavoriteVideosUsecase } from 'src/users/domain/usecases/getFavoriteVideo.usecase';
import { UpdateProfileUseCase } from 'src/users/domain/usecases/updateProfile.usecase';
import { UpdateProfileUseCaseWithoutImage } from 'src/users/domain/usecases/updateProfileWithoutImage.usecase';
import { UpdateUserDto } from './dto/update-user.dto';
import { AddLikedCommentUsecase } from 'src/users/domain/usecases/addLikedComment.usecase';
import { RemoveLikedCommentUsecase } from 'src/users/domain/usecases/removeLikedComment.usecase';
import { GetLikedCommentUsecase } from 'src/users/domain/usecases/getLikeComments.usecase';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(
    private createNewUserUsecase: CreateNewUserUsecase,
    private getUserUsecase: GetUsersUsecase,
    private loginUserUsecase: LoginUserUseCase,
    private getProfilePictureUsecase: GetProfilePictureUsecase,
    private getListUserUsecase: GetListUsersUsecase,
    private addFavoriteVideoUsecase: AddFavoriteVideoUsecase,
    private removeFavoriteVideoUsecase: RemoveFavoriteVideoUsecase,
    private isFavoriteVideoUsecase: IsFavoriteVideoUsecase,
    private readonly getFavoriteVideosUsecase: GetFavoriteVideosUsecase,
    private updateProfileUsecase: UpdateProfileUseCase,
    private updateProfileWithoutImageUsecase: UpdateProfileUseCaseWithoutImage,
    private addLikedCommentUsecase: AddLikedCommentUsecase,
    private removeLikedCommentUsecase: RemoveLikedCommentUsecase,
    private getLikedCommentUsecase: GetLikedCommentUsecase,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @UsePipes(new ValidationPipe())
  async postUser(
    @UploadedFile() file: Express.Multer.File,
    @Body() user: CreateUserDto,
  ): Promise<UserObject> {
    return await this.createNewUserUsecase.execute(user, file);
  }

  /*@Post()
  @UsePipes(new ValidationPipe())
  async postUser(@Body() user: CreateUserDto): Promise<UserObject> {
    return this.createNewUserUsecase.execute(user);
  }*/

  @Get()
  find(@Query() filter: any): Promise<UserObject[]> {
    return this.getUserUsecase.execute(filter);
  }

  @Get('login')
  login(@AuthenticatedUser() keycloak_user: any): Promise<UserObject> {
    return this.loginUserUsecase.execute(keycloak_user);
  }

  @Get('/picture/:id')
  async getProfilePicture(@Param('id') id: string): Promise<string> {
    return await this.getProfilePictureUsecase.execute(id);
  }

  @Get('/find')
  find_many(@Query() filter: any): Promise<UserObject[]> {
    return this.getListUserUsecase.execute(filter);
  }

  @Post('/favorites/:videoId')
  async addFavorite(
    @AuthenticatedUser() user: any,
    @Param('videoId') videoId: string,
  ): Promise<{ success: boolean }> {
    await this.addFavoriteVideoUsecase.execute(user.email, videoId);
    return { success: true };
  }

  @Delete('/favorites/:videoId')
  async removeFavorite(
    @AuthenticatedUser() user: any,
    @Param('videoId') videoId: string,
  ): Promise<{ success: boolean }> {
    await this.removeFavoriteVideoUsecase.execute(user.email, videoId);
    return { success: true };
  }

  @Get('/favorites/:videoId')
  async isFavorite(
    @AuthenticatedUser() user: any,
    @Param('videoId') videoId: string,
  ): Promise<{ isFavorite: boolean }> {
    const result = await this.isFavoriteVideoUsecase.execute(
      user.email,
      videoId,
    );
    return { isFavorite: result };
  }

  @Get('/favorites')
  async getFavoriteVideosByEmail(@AuthenticatedUser() user: any) {
    return this.getFavoriteVideosUsecase.execute(user.email);
  }

  @Post(`/update`)
  @UseInterceptors(FileInterceptor('file'))
  @UsePipes(new ValidationPipe())
  async updateUser(
    @AuthenticatedUser() user: any,
    @Body() newProfile: UpdateUserDto,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ success: boolean }> {
    await this.updateProfileUsecase.execute(user.email, newProfile, file);
    return { success: true };
  }

  @Post(`/update2`)
  @UsePipes(new ValidationPipe())
  async updateUser2(
    @AuthenticatedUser() user: any,
    @Body() newProfile: UpdateUserDto,
  ): Promise<{ success: boolean }> {
    await this.updateProfileWithoutImageUsecase.execute(user.email, newProfile);
    return { success: true };
  }

  @Post('/like/:commentId')
  async addLike(
    @AuthenticatedUser() user: any,
    @Param('commentId') commentId: string,
  ): Promise<{ success: boolean }> {
    await this.addLikedCommentUsecase.execute(user.email, commentId);
    return { success: true };
  }

  @Delete('/like/:commentId')
  async removeLike(
    @AuthenticatedUser() user: any,
    @Param('commentId') commentId: string,
  ): Promise<{ success: boolean }> {
    await this.removeLikedCommentUsecase.execute(user.email, commentId);
    return { success: true };
  }

  @Get('/like')
  async getLikedCommentsByEmail(@AuthenticatedUser() user: any) {
    return this.getLikedCommentUsecase.execute(user.email);
  }
}
