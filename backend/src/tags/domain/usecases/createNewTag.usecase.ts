import { CreateTagDto } from '../../infra/controllers/dto/create-tag.dto';
import { ITagGateway } from '../gateways/tags.gateway';
import { TagObject } from '../tag';
import { v4 as uuid } from 'uuid';
import { Inject } from '@nestjs/common';

export class CreateNewTagUsecase {
  constructor(
    @Inject('TagGateway')
    private tagGateway: ITagGateway,
  ) {}

  async execute(tagToCreate: CreateTagDto): Promise<TagObject> {
    const tag = new TagObject(
      uuid(),
      tagToCreate.name,
      [],
      new Date(),
      new Date(),
    );

    await this.tagGateway.createNewTag(tag);
    return tag;
  }
}
