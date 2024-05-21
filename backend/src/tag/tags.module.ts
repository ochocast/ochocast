import { Module } from '@nestjs/common';
import { TagsController } from './infra/controllers/tags.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TagEntity } from './infra/gateways/entities/tag.entity';
import { TagGateway } from './infra/gateways/tag.gateway';
import { CreateNewTagUsecase } from './domain/usecases/createNewTag.usecase';
import { GetTagsUsecase } from './domain/usecases/getTags.usecase';
import { UpdateTagUsecase } from './domain/usecases/updateTag.usecase';
import { DeleteTagsUsecase } from './domain/usecases/deleteTags.usecase';

@Module({
  imports: [TypeOrmModule.forFeature([TagEntity])],
  controllers: [TagsController],
  providers: [
    {
      provide: 'TagGateway',
      useClass: TagGateway,
    },
    CreateNewTagUsecase,
    GetTagsUsecase,
    UpdateTagUsecase,
    DeleteTagsUsecase,
  ],
})
export class TagsModule {}
