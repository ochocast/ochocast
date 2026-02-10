import { ApiProperty } from '@nestjs/swagger';
import { UserEntity } from 'src/users/infra/gateways/entities/user.entity';
import { VideoEntity } from 'src/videos/infra/gateways/entities/video.entity';

export class CommentObject {
  @ApiProperty({
    example: 'ad1b1aa3-d2b3-4041-bfe9-a511bcbe27a2',
    description: 'The unique identifier of the comment.',
  })
  id: string;

  @ApiProperty({
    example: 'ad1b1aa3-d2b3-4041-bfe9-a511bcbe27a2',
    description: 'The identifier of the parent comment.',
    nullable: true,
  })
  parentid?: string | null;

  @ApiProperty({
    example: 'A spooky comment',
    description: 'The content of the comment.',
  })
  content: string;

  @ApiProperty({
    example: 'ad1b1aa3-d2b3-4041-bfe9-a511bcbe27a2',
    description: 'The unique identifier of the creator.',
  })
  creator: UserEntity;

  @ApiProperty({
    example: 'ad1b1aa3-d2b3-4041-bfe9-a511bcbe27a2',
    description: 'The unique identifier of the video.',
  })
  video: VideoEntity;

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

  @ApiProperty({
    example: 'ad1b1aa3-d2b3-4041-bfe9-a511bcbe27a2',
    description: 'The identifier of the parent comment.',
    nullable: true,
  })
  likes?: number;

  constructor(
    id: string,
    parentid: string,
    creator: UserEntity,
    video: VideoEntity,
    content: string,
    createdAt: Date,
    updatedAt: Date,
    likes: number,
  ) {
    this.id = id;
    this.parentid = parentid;
    this.creator = creator;
    this.video = video;
    this.content = content;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.likes = likes;
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
