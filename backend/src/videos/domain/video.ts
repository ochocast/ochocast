import { ApiProperty } from '@nestjs/swagger';
import { CommentEntity } from 'src/comments/infra/gateways/entities/comment.entity';
import { TagEntity } from 'src/tags/infra/gateways/entities/tag.entity';
import { UserEntity } from 'src/users/infra/gateways/entities/user.entity';

export class VideoObject {
  @ApiProperty({
    example: 'ad1b1aa3-d2b3-4041-bfe9-a511bcbe27a2',
    description: 'The unique identifier of the video.',
  })
  id: string;

  @ApiProperty({
    example: 'ad1b1aa3-d2b3-4041-bfe9-a511bcbe27a2',
    description: 'The id of the media on MinIO.',
  })
  media_id: string;

  @ApiProperty({
    example: 'ad1b1aa3-d2b3-4041-bfe9-a511bcbe27a2',
    description: 'The id of the miniature on MinIO.',
  })
  miniature_id: string;

  @ApiProperty({
    example: 'ad1b1aa3-d2b3-4041-bfe9-a511bcbe27a2',
    description: 'The id of the subtitle file on MinIO.',
    required: false,
  })
  subtitle_id?: string;

  @ApiProperty({
    example: 'A spooky description',
    description: 'The description of the video.',
  })
  description: string;

  @ApiProperty({
    example:
      '["ad1b1aa3-d2b3-4041-bfe9-a511bcbe27a2", "ad1b1aa3-d2b3-4041-bfe9-a511bcbe27a2"]',
    description: 'The list of identifiers of the tags of the video.',
  })
  tags: TagEntity[];

  @ApiProperty({
    example: 'Very good video',
    description: 'The title of the video.',
  })
  title: string;

  @ApiProperty({
    example: 'ad1b1aa3-d2b3-4041-bfe9-a511bcbe27a2',
    description: 'The unique identifier of the creator.',
  })
  creator: UserEntity;

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
    example:
      '["ad1b1aa3-d2b3-4041-bfe9-a511bcbe27a2", "ad1b1aa3-d2b3-4041-bfe9-a511bcbe27a2"]',
    description:
      'The list of identifiers of speakers that appear in the video.',
  })
  internal_speakers: UserEntity[];

  @ApiProperty({
    example: '["Bill Gates", "Elon Musk"]',
    description:
      'The list of names of external speakers that appear in the video.',
  })
  external_speakers: string;

  @ApiProperty({
    example: '2',
    description: 'Number of views on the video.',
  })
  views: number;

  @ApiProperty({
    example: 120.5,
    description: 'The duration of the video in seconds.',
    required: false,
  })
  duration?: number;

  @ApiProperty({
    example:
      '[ad1b1aa3-d2b3-4041-bfe9-a511bcbe27a2, d2b3-ad1b1aa3-a511bcbe27a2-4041-bfe9]',
    description: 'The comments on the video.',
  })
  comments: CommentEntity[];

  @ApiProperty({
    example:
      '[ad1b1aa3-d2b3-4041-bfe9-a511bcbe27a2, d2b3-ad1b1aa3-a511bcbe27a2-4041-bfe9]',
    description: 'The comments on the video.',
  })
  archived: boolean;

  constructor(
    id: string,
    media_id: string,
    miniature_id: string,
    title: string,
    description: string,
    tags: TagEntity[],
    creator: UserEntity,
    createdAt: Date,
    updatedAt: Date,
    internal_speakers: UserEntity[],
    external_speakers: string,
    views: number,
    comments: CommentEntity[],
    archived: boolean,
    subtitle_id?: string,
    duration?: number,
  ) {
    this.id = id;
    this.media_id = media_id;
    this.miniature_id = miniature_id;
    this.subtitle_id = subtitle_id;
    this.title = title;
    this.creator = creator;
    this.description = description;
    this.tags = tags;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.internal_speakers = internal_speakers;
    this.external_speakers = external_speakers;
    this.views = views;
    this.comments = comments;
    this.archived = archived;
    this.duration = duration;
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
