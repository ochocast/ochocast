import { ApiProperty } from '@nestjs/swagger';

export class TrackObject {
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
  event: string;

  @ApiProperty({
    example: '2021-10-31T00:00:00.000Z',
    description: 'The date the track was created.',
  })
  createdAt: Date;

  constructor(
    id: string,
    name: string,
    description: string,
    keywords: string[],
    streamKey: string,
    closed: boolean = false,
    event: string,
    createdAt: Date,
  ) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.keywords = keywords;
    this.streamKey = streamKey;
    this.closed = closed;
    this.event = event;
    this.createdAt = createdAt;
  }
}

// This file can be reworked with the constructor shorthand syntax as soon as the following issue is fixed:
// https://github.com/nestjs/swagger/issues/2056#issuecomment-1442301176

// export class TrackObject {
//   constructor(
//     public id: string,
//     public name: string,
//     public description: string,
//     public keywords: string[],
//     public streamKey: string,
//     public closed: boolean = false,
//     public event: string,
//     public createdAt: Date,
//   ) {}
// }
