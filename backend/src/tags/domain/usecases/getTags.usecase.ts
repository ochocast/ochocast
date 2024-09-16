import { Inject } from '@nestjs/common';
import { ITagGateway } from '../gateways/tags.gateway';
import { TagObject } from '../tag';

export class GetTagsUsecase {
  constructor(
    @Inject('TagGateway')
    private tagGateway: ITagGateway,
  ) {}

  async execute(filter: any): Promise<TagObject[]> {
    return await this.tagGateway.getTags(filter);
  }
}
