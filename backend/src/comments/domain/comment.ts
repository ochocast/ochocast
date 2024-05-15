import { ApiProperty } from '@nestjs/swagger';
import { UserEntity } from 'src/users/infra/gateways/entities/user.entity';

export class CommentObject {
  @ApiProperty({
    example: 'ad1b1aa3-d2b3-4041-bfe9-a511bcbe27a2',
    description: 'The unique identifier of the comment.',
  })
  id: string;

  @ApiProperty({
    example: 'A spooky comment',
    description: 'The content of the comment.',
  })
  content: string;

  @ApiProperty({
    example: 'ad1b1aa3-d2b3-4041-bfe9-a511bcbe27a2',
    description: 'The unique identifier of the creator.',
  })
  creator: string;

  @ApiProperty({
    example: 'ad1b1aa3-d2b3-4041-bfe9-a511bcbe27a2',
    description: 'The unique identifier of the video.',
  })
  video: string;

  @ApiProperty({
    example: '2021-10-31T00:00:00.000Z',
    description: 'The date the comment was created.',
  })
  createdAt: Date;

  @ApiProperty({
    example: '2021-10-31T00:00:00.000Z',
    description: 'The date the comment was updated.',
  })
  updatedAt: Date;

  constructor(
    id: string,
    name: string,
    description: string,
    keywords: string[],
    streamKey: string,
    closed: boolean = false,
    event: string,
    createdAt: Date,
    updatedAt: Date,
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

// export class CommentObject {
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

// HERE : ON EST ICI - WORK IN PROGRESS !!! 