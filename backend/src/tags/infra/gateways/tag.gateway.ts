import { ITagGateway } from '../../domain/gateways/tags.gateway';
import { TagObject } from '../../domain/tag';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { TagEntity } from './entities/tag.entity';

export class TagGateway implements ITagGateway {
  constructor(
    @InjectRepository(TagEntity)
    private readonly tagsRepository: Repository<TagEntity>,
  ) {}

  async createNewTag(tagDetails: TagObject): Promise<TagObject> {
    const tag: TagEntity = new TagEntity({
      ...tagDetails,
    });

    return await this.tagsRepository.save(tag);
  }

  getTags(filter: any): Promise<TagObject[]> {
    return this.tagsRepository.find({
      where: {
        ...filter,
      }, //,
      //relations: ['event'],
    });
  }

  getListTags(filter: any): Promise<TagObject[]> {
    const where: any = {};
    where.name = ILike(`%${filter.value}%`);

    return this.tagsRepository.find({
      where,
    });
  }

  /*async updateTag(tagDetails: TagObject): Promise<TagObject> {
    const tag = await this.tagsRepository.findOne({
      where: {
        id: tagDetails.id,
      },
    });

    return await this.tagsRepository.save({
      ...tag,
      ...tagDetails,
    });
  }*/

  async deleteTag(id: string): Promise<TagObject> {
    const tag = await this.tagsRepository.findOneBy({ id: id });

    return await this.tagsRepository.remove(tag);
  }
}
