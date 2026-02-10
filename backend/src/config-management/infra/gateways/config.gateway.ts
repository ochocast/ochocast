import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IConfigGateway } from '../../domain/gateways/config.gateway';
import { ConfigObject } from '../../domain/config';
import { ConfigFileEntity } from './entities/config-file.entity';

@Injectable()
export class ConfigGateway implements IConfigGateway {
  constructor(
    @InjectRepository(ConfigFileEntity)
    private configFileRepository: Repository<ConfigFileEntity>,
  ) {}

  async addConfigFile(config: ConfigObject): Promise<ConfigObject> {
    const configEntity = this.configFileRepository.create({
      id: config.id,
      fileUrl: config.fileUrl,
      createdAt: config.createdAt,
    });

    const savedEntity = await this.configFileRepository.save(configEntity);
    return this.entityToObject(savedEntity);
  }

  async getLatestConfigFile(): Promise<ConfigObject | null> {
    const entities = await this.configFileRepository.find({
      order: { createdAt: 'DESC' },
      take: 1,
    });

    return entities.length > 0 ? this.entityToObject(entities[0]) : null;
  }

  async deleteConfigFile(id: string): Promise<boolean> {
    const result = await this.configFileRepository.delete({ id });
    return result.affected > 0;
  }

  async deleteAllConfigFiles(): Promise<boolean> {
    await this.configFileRepository.clear();
    return true;
  }

  private entityToObject(entity: ConfigFileEntity): ConfigObject {
    return new ConfigObject(entity.id, entity.fileUrl, entity.createdAt);
  }
}
