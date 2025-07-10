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
      // Upload vers S3
      const upload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: process.env.S3_BUCKET_NAME,
          Key: `config/${uniqueFileName}`,
          Body: configFile.buffer,
          ContentType: 'text/yaml',
          Metadata: {
            originalName: configFile.originalname,
            uploadedBy: currentUserEmail,
            uploadedAt: new Date().toISOString(),
          },
        },
      });

      const result = await upload.done();
      const fileUrl = result.Location || `config/${uniqueFileName}`;

      // Créer l'objet config
      const configObject = new ConfigObject(uuid(), fileUrl, new Date());

      // Sauvegarder en base de données
      return await this.configGateway.addConfigFile(configObject);
    } catch (error) {
      throw new BadRequestException(
        `Failed to upload config file: ${error.message}`,
      );
    }
  }
}
