import {
  Inject,
  Injectable,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { IConfigGateway } from '../gateways/config.gateway';
import { ConfigObject } from '../config';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { v4 as uuid } from 'uuid';
import e from 'express';

@Injectable()
export class AddConfigFileUsecase {
  constructor(
    @Inject('ConfigGateway') private configGateway: IConfigGateway,
    @Inject('UserGateway') private userGateway: IUserGateway,
    @Inject('s3Client') private s3Client: S3Client,
  ) {}

  async execute(
    currentUserEmail: string,
    configFile: Express.Multer.File,
    images?: Express.Multer.File[],
    imageIds?: string[],
  ): Promise<ConfigObject> {
    // Vérifier que l'utilisateur est admin
    const user = await this.userGateway.getUserByEmail(currentUserEmail);
    if (!user) {
      throw new ForbiddenException('User not found');
    }

    if (user.role !== 'admin') {
      throw new ForbiddenException(
        'Only administrators can upload config files',
      );
    }

    if (!configFile) {
      throw new BadRequestException('Config file is required');
    }

    // Valider que le fichier est un YAML
    const allowedMimeTypes = ['text/yaml', 'application/x-yaml', 'text/plain'];

    if (!allowedMimeTypes.includes(configFile.mimetype)) {
      throw new BadRequestException(
        'Invalid file type. Only YAML files are allowed.',
      );
    }

    // Générer un nom de fichier unique pour YAML
    const uniqueFileName = `config-${Date.now()}-${uuid()}.yaml`;

    try {
      const key = `config/${uniqueFileName}`;

      // Upload config file to S3
      const upload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: process.env.STOCK_BRANDING_BUCKET,
          Key: key,
          Body: configFile.buffer,
          ContentType: 'text/yaml',
        },
      });
      const result = await upload.done();

      // Upload images if provided
      if (images && images.length > 0) {
        for (let i = 0; i < images.length; i++) {
          const image = images[i];
          const imageUpload = new Upload({
            client: this.s3Client,
            params: {
              Bucket: process.env.STOCK_BRANDING_BUCKET,
              Key: imageIds[i],
              Body: image.buffer,
              ContentType: image.mimetype,
            },
          });
          await imageUpload.done();
        }
      }

      // Créer l'objet config
      const configObject = new ConfigObject(uuid(), key, new Date());

      // Sauvegarder en base de données
      return await this.configGateway.addConfigFile(configObject);
    } catch (error) {
      console.error('Failed to upload config file:', error);

      throw new BadRequestException(
        `Failed to upload config file: ${error.message}`,
      );
    }
  }
}
