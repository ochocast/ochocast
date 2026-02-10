import { ApiProperty } from '@nestjs/swagger';
import { UserEntity } from 'src/users/infra/gateways/entities/user.entity';
import { VideoEntity } from 'src/videos/infra/gateways/entities/video.entity';

export class TagObject {
  @ApiProperty({
    example: 'ad1b1aa3-d2b3-4041-bfe9-a511bcbe27a2',
    description: 'The unique identifier of the tag.',
  })
  id: string;

  @ApiProperty({
    example: 'DevOps',
    description: 'The name of the tag.',
  })
  name: string;

  @ApiProperty({
    example:
      '[ad1b1aa3-d2b3-4041-bfe9-a511bcbe27a2, a511bcbe27a2-ad1b1aa3-bfe9-d2b3-4041]',
    description: 'The identifiers of the videos.',
  })
  videos: VideoEntity[];

  @ApiProperty({
    example: '2021-10-31T00:00:00.000Z',
    description: 'The date the tag was created.',
  })
  createdAt: Date;

  @ApiProperty({
    example: '2021-10-31T00:00:00.000Z',
    description: 'The date the tag was updated.',
  })
  updatedAt: Date;

  constructor(
    id: string,
    name: string,
    videos: VideoEntity[],
    createdAt: Date,
    updatedAt: Date,
  ) {
    this.id = id;
    this.name = name;
    this.videos = videos;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}
