import { TrackObject } from 'src/tracks/domain/track';
import { ApiProperty } from '@nestjs/swagger';
import { EventObject } from './event';
import { PublicUserObject } from 'src/users/domain/publicUser';
import { UserObject } from 'src/users/domain/user';
import { TagEntity } from 'src/tags/infra/gateways/entities/tag.entity';

export class PublicEventObject {
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
    example: false,
    description: 'Whether the event can be edit by the current user.',
  })
  canBeEditByUser: boolean = false;

  @ApiProperty({
    example: [PublicUserObject],
    description: 'Creator.',
  })
  creator: PublicUserObject;

  @ApiProperty({
    example: 42,
    description: 'Number of subsription.',
  })
  nbSubscription: number;

  @ApiProperty({
    example: ['user1-id', 'user2-id'],
    description: 'List of user IDs that are subscribed to the event.',
  })
  subscribedUserIds: string[];

  constructor(event: EventObject, currentUser: UserObject) {
    this.id = event.id;
    this.name = event.name;
    this.description = event.description;
    this.tags = event.tags;
    this.startDate = event.startDate;
    this.endDate = event.endDate;
    this.published = event.published;
    this.isPrivate = event.isPrivate;
    this.closed = event.closed;
    this.imageSlug = event.imageSlug;
    this.tracks = event.tracks;
    this.creatorId = event.creatorId;
    this.canBeEditByUser =
      currentUser != null &&
      (currentUser.email === event.creator.email ||
        event.tracks?.some((track) =>
          track.speakers?.some((speaker) => speaker.id === currentUser.id),
        ));
    this.creator = new PublicUserObject(event.creator);
    this.nbSubscription = event.usersSubscribe?.length;
    this.subscribedUserIds = event.usersSubscribe?.map((user) => user.id) || [];
  }
}
