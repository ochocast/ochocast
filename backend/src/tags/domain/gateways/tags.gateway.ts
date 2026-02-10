import { TagObject } from '../tag';

export interface ITagGateway {
  createNewTag: (tag: TagObject) => Promise<TagObject>;
  getTags: (filter: any) => Promise<TagObject[]>;
  deleteTag: (id: string) => Promise<TagObject>;
  getListTags: (filter: any) => Promise<TagObject[]>;
}
