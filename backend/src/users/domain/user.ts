import { CommentEntity } from 'src/comments/infra/gateways/entities/comment.entity';
import { EventObject } from '../../events/domain/event';
import { ApiProperty } from '@nestjs/swagger';
import { VideoEntity } from 'src/videos/infra/gateways/entities/video.entity';
import { VideoObject } from 'src/videos/domain/video';

export class UserObject {
  @ApiProperty({
    example: 'e43dadbd-1006-4556-8f70-98225d569fa2',
    description: 'The unique identifier of the user.',
  })
  id: string;

  @ApiProperty({
    example: 'John',
    description: 'The user name of the user.',
  })
  username: string;

  @ApiProperty({
    example: 'John',
    description: 'The first name of the user.',
  })
  firstName: string;

  @ApiProperty({
    example: 'Doe',
    description: 'The last name of the user.',
  })
  lastName: string;

  @ApiProperty({
    example: 'johndoe@gmail.com',
    description: 'The email of the user.',
  })
  email: string;

  @ApiProperty({
    example: 'admin',
    description: 'The role of the user.',
  })
  role: string;

  @ApiProperty({
    example: 'I am very kind and respectful',
    description: 'The description of a user.',
  })
  description: string;

  @ApiProperty({
    example: '[12342141, 129827487, 1239273892]',
    description: 'The comments that the user wrote.',
  })
  comments: CommentEntity[];

  @ApiProperty({
    example: '[12342141, 129827487, 1239273892]',
    description: 'The videos that the user published.',
  })
  videos: VideoEntity[];

  @ApiProperty({
    example: [EventObject],
    description: 'The events owned by the user.',
  })
  events: EventObject[];

  @ApiProperty({
    example: [VideoObject],
    description: 'The videos in which the user appears.',
  })
  videosAsSpeaker: VideoEntity[];

  @ApiProperty({
    example: '2021-10-31T00:00:00.000Z',
    description: 'The date the user was created.',
  })
  createdAt: Date;

  @ApiProperty({
    example: 'ad1b1aa3-d2b3-4041-bfe9-a511bcbe27a2',
    description: 'The id of the profile picture.',
  })
  picture_id: string;

  constructor(
    id: string,
    username: string,
    firstName: string,
    lastName: string,
    email: string,
    role: string,
    events: EventObject[],
    comments: CommentEntity[],
    videos: VideoEntity[],
    description: string,
    createdAt: Date,
    picture_id: string,
  ) {
    this.id = id;
    this.username = username;
    this.firstName = firstName;
    this.lastName = lastName;
    this.email = email;
    this.role = role;
    this.comments = comments;
    this.videos = videos;
    this.events = events;
    this.description = description;
    //this.videosAsSpeaker = videosAsSpeaker;
    this.createdAt = createdAt;
    this.picture_id = picture_id;
  }
}

// This file can be reworked with the constructor shorthand syntax as soon as the following issue is fixed:
// https://github.com/nestjs/swagger/issues/2056#issuecomment-1442301176

// import { EventObject } from '../../events/domain/event';
//
// export class UserObject {
//   constructor(
//     public id: string,
//     public firstName: string,
//     public lastName: string,
//     public email: string,
//     public role: string,
//     public events: EventObject[],
//     public createdAt: Date,
//   ) {}
// }
