import { TrackEntity } from '../../tracks/infra/gateways/entities/track.entity';

export class EventObject {
  constructor(
    public id: string,
    public name: string,
    public description: string,
    public category: string,
    public tags: string[],
    public startDate: Date,
    public endDate: Date,
    public published: boolean = false,
    public isPrivate: boolean = true,
    public closed: boolean = false,
    public imageSlug: string,
    public tracks: TrackEntity[],
    public creator: string,
    public createdAt: Date,
  ) {}
}
