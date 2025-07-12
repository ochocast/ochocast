import { TrackObject } from 'src/tracks/domain/track';
import { ApiProperty } from '@nestjs/swagger';
import { UserObject } from 'src/users/domain/user';
import { PublicUserObject } from 'src/users/domain/publicUser';
import { TagEntity } from 'src/tags/infra/gateways/entities/tag.entity';

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
    example: ['spooky', 'halloween'],
    description: 'The tags of the event.',
  })
  tags: TagEntity[];

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
    example: [TrackObject],
    description: 'The tracks of the event.',
  })
  tracks: TrackObject[];

  @ApiProperty({
    example: 'e43dadbd-1006-4556-8f70-98225d569fa2',
    description: 'The unique identifier of the creator.',
  })
  creatorId: string;

  @ApiProperty({
    example: '2021-10-31T00:00:00.000Z',
    description: 'The date the event was created.',
  })
  createdAt: Date;

  @ApiProperty({
    example: [UserObject],
    description: 'The creator.',
  })
  creator: UserObject | undefined;

  @ApiProperty({
    example: [PublicUserObject],
    description: 'public user subscribe to the evetn.',
  })
  usersSubscribe: PublicUserObject[];

  public canBeEditBy(user: UserObject): boolean {
    return this.creator.email === user.email;
  }

  public canBeReadBy(user: UserObject): boolean {
    return (
      this.creator.email === user.email ||
      this.tracks.some((track) => track.speakers?.some((s) => s.id === user.id))
    );
  }

  constructor(
    id: string,
    name: string,
    description: string,
    tags: TagEntity[],
    startDate: Date,
    endDate: Date,
    published: boolean = false,
    isPrivate: boolean = true,
    closed: boolean = false,
    imageSlug: string,
    tracks: TrackObject[],
    creatorId: string,
    createdAt: Date,
    creator: UserObject,
    usersSubscribe: PublicUserObject[],
  ) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.tags = tags;
    this.startDate = startDate;
    this.endDate = endDate;
    this.published = published;
    this.isPrivate = isPrivate;
    this.closed = closed;
    this.imageSlug = imageSlug;
    this.tracks = tracks;
    this.creatorId = creatorId;
    this.createdAt = createdAt;
    this.creator = creator;
    this.usersSubscribe = usersSubscribe;
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
