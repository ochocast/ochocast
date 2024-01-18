import { TrackEntity } from '../../tracks/infra/gateways/entities/track.entity';
import { ApiProperty } from '@nestjs/swagger';

export class EventObject {
  @ApiProperty({
    example: '4ea6d8c0-8819-4378-bfee-98bd1bd50be0',
    description: 'The unique identifier of the event.',
  })
  id: string;

  @ApiProperty({
    example: 'Halloween',
    description: 'The name of the event.',
  })
  name: string;

  @ApiProperty({
    example: 'A spooky event',
    description: 'The description of the event.',
  })
  description: string;

  @ApiProperty({
    example: 'halloween',
    description: 'The category of the event.',
  })
  category: string;

  @ApiProperty({
    example: ['spooky', 'halloween'],
    description: 'The tags of the event.',
  })
  tags: string[];

  @ApiProperty({
    example: '2021-10-31T00:00:00.000Z',
    description: 'The date the event starts.',
  })
  startDate: Date;

  @ApiProperty({
    example: '2021-10-31T00:00:00.000Z',
    description: 'The date the event ends.',
  })
  endDate: Date;

  @ApiProperty({
    example: false,
    description: 'Whether the event is published or not.',
  })
  published: boolean = false;

  @ApiProperty({
    example: true,
    description: 'Whether the event is private or not.',
  })
  isPrivate: boolean = true;

  @ApiProperty({
    example: false,
    description: 'Whether the event is closed or not.',
  })
  closed: boolean = true;

  @ApiProperty({
    example: 'halloween',
    description: 'The image slug of the event.',
  })
  imageSlug: string;

  @ApiProperty({
    example: [TrackEntity],
    description: 'The tracks of the event.',
  })
  tracks: TrackEntity[];

  @ApiProperty({
    example: 'e43dadbd-1006-4556-8f70-98225d569fa2',
    description: 'The unique identifier of the creator.',
  })
  creator: string;

  @ApiProperty({
    example: '2021-10-31T00:00:00.000Z',
    description: 'The date the event was created.',
  })
  createdAt: Date;

  constructor(
    id: string,
    name: string,
    description: string,
    category: string,
    tags: string[],
    startDate: Date,
    endDate: Date,
    published: boolean = false,
    isPrivate: boolean = true,
    closed: boolean = false,
    imageSlug: string,
    tracks: TrackEntity[],
    creator: string,
    createdAt: Date,
  ) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.category = category;
    this.tags = tags;
    this.startDate = startDate;
    this.endDate = endDate;
    this.published = published;
    this.isPrivate = isPrivate;
    this.closed = closed;
    this.imageSlug = imageSlug;
    this.tracks = tracks;
    this.creator = creator;
    this.createdAt = createdAt;
  }
}

// This file can be reworked with the constructor shorthand syntax as soon as the following issue is fixed:
// https://github.com/nestjs/swagger/issues/2056#issuecomment-1442301176

// import { TrackEntity } from '../../tracks/infra/gateways/entities/track.entity';
//
// export class EventObject {
//   constructor(
//     public id: string,
//     public name: string,
//     public description: string,
//     public category: string,
//     public tags: string[],
//     public startDate: Date,
//     public endDate: Date,
//     public published: boolean = false,
//     public isPrivate: boolean = true,
//     public closed: boolean = false,
//     public imageSlug: string,
//     public tracks: TrackEntity[],
//     public creator: string,
//     public createdAt: Date,
//   ) {}
// }
