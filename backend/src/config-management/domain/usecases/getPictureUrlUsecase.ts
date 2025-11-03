import { Inject, Injectable } from '@nestjs/common';
import { IConfigGateway } from '../gateways/config.gateway';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class GetPictureUrlUsecase {
  constructor(
    @Inject('ConfigGateway')
    private configGateway: IConfigGateway,
    @Inject('s3Client')
    private s3Client: S3Client,
  ) {}

  async execute(key: string): Promise<string> {
    // Si la clé utilise le préfixe ::default::, retourner l'URL directe
    if (key.startsWith('::default::')) {
      const defaultImagePath = key.replace('::default::', '');
      return `/branding/${defaultImagePath}`;
    }

    // Sinon, récupérer depuis S3
    const command = new GetObjectCommand({
      Bucket: process.env.STOCK_BRANDING_BUCKET,
      Key: key,
    });

    const url = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
    return url;
  }
}
