import { Inject } from '@nestjs/common';
import { IUserGateway } from '../gateways/users.gateway';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

export class GetProfilePictureUsecase {
  constructor(
    @Inject('UserGateway')
    private userGateway: IUserGateway,
    @Inject('s3Client')
    private s3Client: S3Client,
  ) {}

  async execute(id: any): Promise<string> {
    const users = await this.userGateway.getUsers({ id: id });

    const command = new GetObjectCommand({
      Bucket: process.env.STOCK_PROFILE_PICTURE_BUCKET,
      Key: users[0].picture_id,
    });

    // Generate a signed URL valid for 1 hour
    const url = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });

    return url;
  }
}
