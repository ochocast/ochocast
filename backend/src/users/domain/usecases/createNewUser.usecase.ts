import { CreateUserDto } from '../../infra/controllers/dto/create-user.dto';
import { UserObject } from '../user';
import { IUserGateway } from '../gateways/users.gateway';
import { v4 as uuid } from 'uuid';
import { Inject } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

export class CreateNewUserUsecase {
  constructor(
    @Inject('UserGateway')
    private userGateway: IUserGateway,
    @Inject('s3Client')
    private s3Client: S3Client,
  ) {}

  async execute(
    userToCreate: CreateUserDto,
    imageFile: Express.Multer.File,
  ): Promise<UserObject> {
    const pictureId = Date.now() + '.' + userToCreate.picture_id;
    const user = new UserObject(
      uuid(),
      userToCreate.username,
      userToCreate.firstName,
      userToCreate.lastName,
      userToCreate.email,
      userToCreate.role,
      [],
      [],
      [],
      userToCreate.description,
      new Date(),
      pictureId,
    );

    const upload = new Upload({
      client: this.s3Client,
      params: {
        Bucket: process.env.STOCK_PROFILE_PICTURE_BUCKET,
        Key: user.picture_id,
        Body: imageFile.buffer,
        ContentType: imageFile.mimetype,
      },
    });
    await upload.done();

    await this.userGateway.createNewUser(user);
    return user;
  }
}
// TODO : updqted at
