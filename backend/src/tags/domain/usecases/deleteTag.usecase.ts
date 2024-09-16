import { Inject } from '@nestjs/common';
import { ITagGateway } from '../gateways/tags.gateway';
import { TagObject } from '../tag';

export class DeleteTagUsecase {
  constructor(
    @Inject('TagGateway')
    private tagGateway: ITagGateway,
  ) {}

  async execute(id: string): Promise<TagObject> {
    return await this.tagGateway.deleteTag(id);
  }
}
