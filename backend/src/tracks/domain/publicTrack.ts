import { ApiProperty } from '@nestjs/swagger';
import { PublicUserObject } from 'src/users/domain/publicUser';
import { TrackObject } from './track';

export class PublicTrackObject {
  @ApiProperty({
    example: 'ad1b1aa3-d2b3-4041-bfe9-a511bcbe27a2',
    description: 'The unique identifier of the track.',
  })
  id: string;

  @ApiProperty({
    example: 'Halloween',
    description: 'The name of the track.',
  })
  name: string;

  @ApiProperty({
    example: 'A spooky track',
    description: 'The description of the track.',
  })
  description: string;

  @ApiProperty({
    example: ['spooky', 'halloween'],
    description: 'The keywords of the track.',
  })
  keywords: string[];

  @ApiProperty({
    example: 'hWEwee-SoGffg-BHp!zHM23izgSLNGzL',
    description: 'A unique 32 chars stream key for the track.',
  })
  streamKey: string;

  @ApiProperty({
    example: false,
    description: 'Whether the track is closed or not.',
  })
  closed: boolean = false;

  @ApiProperty({
    example: '4ea6d8c0-8819-4378-bfee-98bd1bd50be0',
    description: 'The unique identifier of the parent event.',
  })
  eventId: string;

  @ApiProperty({
    example: '2021-10-31T00:00:00.000Z',
    description: 'The date the track was created.',
  })
  createdAt: Date;

  @ApiProperty({
    example: [PublicUserObject],
    description: 'List of speaker userIds attached to this track.',
  })
  speakers: PublicUserObject[];

  constructor(track: TrackObject) {
    this.id = track.id;
    this.name = track.name;
    this.description = track.description;
    this.keywords = track.keywords;
    this.streamKey = track.streamKey;
    this.closed = track.closed;
    this.eventId = track.eventId;
    this.createdAt = track.createdAt;
    this.speakers = track.speakers.map((e) => new PublicUserObject(e));
  }
}
