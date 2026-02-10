import { Inject } from '@nestjs/common';
import { IUserGateway } from '../gateways/users.gateway';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { UpdateUserDto } from 'src/users/infra/controllers/dto/update-user.dto';
import { tmpdir } from 'os';
import * as path from 'path';
import * as sharp from 'sharp';
import { readFile } from 'node:fs/promises';

export class UpdateProfileUseCase {
  constructor(
    @Inject('UserGateway') private userGateway: IUserGateway,
    @Inject('s3Client') private s3Client: S3Client,
  ) {}

  async execute(
    userEmail: string,
    newProfile: UpdateUserDto,
    file: Express.Multer.File,
  ): Promise<void> {
    const user = await this.userGateway.getUserByEmail(userEmail);
    if (!user) throw new Error('User not found');

    if (file) {
      const tempProfilePicturePath = path.join(
        tmpdir(),
        `ProfilePicture${file.originalname}`,
      );
      await sharp(file.buffer).resize(192, 192).toFile(tempProfilePicturePath);

      const profilePictureUpload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: process.env.STOCK_PROFILE_PICTURE_BUCKET,
          Key: newProfile.picture_id,
          Body: await readFile(tempProfilePicturePath),
          ContentType: file.mimetype,
        },
      });

      const profilePicture_result = await profilePictureUpload.done();
      await this.userGateway.updateUserProfile(
        user.id,
        newProfile.username,
        newProfile.description,
        newProfile.picture_id,
      );
    }
  }
}
