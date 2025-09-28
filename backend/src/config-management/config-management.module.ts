import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigController } from './infra/controllers/config.controller';
import { ConfigGateway } from './infra/gateways/config.gateway';
import { ConfigFileEntity } from './infra/gateways/entities/config-file.entity';
import { AddConfigFileUsecase } from './domain/usecases/addConfigFile.usecase';
import { GetConfigFileUrlUsecase } from './domain/usecases/getConfigFileUrl.usecase';
import { ResetConfigUsecase } from './domain/usecases/resetConfig.usecase';
import { UsersModule } from '../users/users.module';
import { S3Module } from '../s3.module';
import { GetPictureUrlUsecase } from './domain/usecases/getPictureUrlUsecase';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConfigFileEntity]),
    UsersModule,
    S3Module,
  ],
  controllers: [ConfigController],
  providers: [
    {
      provide: 'ConfigGateway',
      useClass: ConfigGateway,
    },
    AddConfigFileUsecase,
    GetConfigFileUrlUsecase,
    ResetConfigUsecase,
    GetPictureUrlUsecase,
  ],
})
export class ConfigManagementModule {}
