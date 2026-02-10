import { Inject, Injectable } from '@nestjs/common';
import { IConfigGateway } from '../gateways/config.gateway';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class GetConfigFileUrlUsecase {
  constructor(
    @Inject('ConfigGateway')
    private configGateway: IConfigGateway,
    @Inject('s3Client')
    private s3Client: S3Client,
  ) {}

  async execute(): Promise<string> {
    const latestConfig = await this.configGateway.getLatestConfigFile();

    if (!latestConfig) {
      return 'default-config';
    }

    const command = new GetObjectCommand({
      Bucket: process.env.STOCK_BRANDING_BUCKET,
      Key: latestConfig.fileUrl,
    });

    const url = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
    return url;
  }
}
