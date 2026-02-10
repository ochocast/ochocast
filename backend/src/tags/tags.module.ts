import { Module } from '@nestjs/common';
import { TagsController } from './infra/controllers/tags.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TagEntity } from './infra/gateways/entities/tag.entity';
import { TagGateway } from './infra/gateways/tag.gateway';
import { CreateNewTagUsecase } from './domain/usecases/createNewTag.usecase';
import { GetTagsUsecase } from './domain/usecases/getTags.usecase';
import { DeleteTagUsecase } from './domain/usecases/deleteTag.usecase';
import { GetListTagsUsecase } from './domain/usecases/getListTags.usecase';

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
    DeleteTagUsecase,
    GetListTagsUsecase,
  ],
})
export class TagsModule {}
