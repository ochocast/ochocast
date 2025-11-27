import { ApiProperty } from '@nestjs/swagger';

export class CreatorInfo {
  id: string;
  firstName: string;
  lastName: string;
  description: string;
  picture_id: string;
}

export class PollObject {
  @ApiProperty({
    example: 'ad1b1aa3-d2b3-4041-bfe9-a511bcbe27a2',
    description: 'The unique identifier of the poll.',
  })
  id: string;

  @ApiProperty({
    example: 'What is your favorite color?',
    description: 'The question of the poll.',
  })
  question: string;

  @ApiProperty({
    example: ['Red', 'Blue', 'Green'],
    description: 'The list of possible responses.',
  })
  responses: string[];

  @ApiProperty({
    example: 'active',
    description: 'The status of the poll: active, closed, or archived.',
    enum: ['active', 'closed', 'archived'],
  })
  status: 'active' | 'closed' | 'archived';

  @ApiProperty({
    example: 60,
    description: 'The duration of the poll in seconds.',
  })
  duration: number;

  @ApiProperty({
    example: 'ad1b1aa3-d2b3-4041-bfe9-a511bcbe27a2',
    description: 'The unique identifier of the track.',
  })
  trackId: string;

  @ApiProperty({
    description: 'The user who created the poll.',
  })
  createdBy: CreatorInfo;

  @ApiProperty({
    example: '2021-10-31T00:00:00.000Z',
    description: 'The date the poll was created.',
  })
  createdAt: Date;

  @ApiProperty({
    example: '2021-10-31T00:01:00.000Z',
    description:
      'The exact server time when the poll expires (createdAt + duration).',
  })
  expiresAt: Date;

  @ApiProperty({
    example: { 0: 5, 1: 3, 2: 2 },
    description: 'The vote counts for each response index.',
  })
  voteCount: Record<number, number>;

  @ApiProperty({
    example: 10,
    description: 'The total number of votes.',
  })
  totalVotes: number;

  constructor(
    id: string,
    question: string,
    responses: string[],
    status: 'active' | 'closed' | 'archived',
    duration: number,
    trackId: string,
    createdBy: CreatorInfo,
    createdAt: Date,
    voteCount: Record<number, number> = {},
    totalVotes: number = 0,
    expiresAt?: Date,
  ) {
    this.id = id;
    this.question = question;
    this.responses = responses;
    this.status = status;
    this.duration = duration;
    this.trackId = trackId;
    this.createdBy = createdBy;
    this.createdAt = createdAt;
    this.voteCount = voteCount;
    this.totalVotes = totalVotes;
    // Use provided expiresAt if available, otherwise calculate it
    if (expiresAt) {
      this.expiresAt = expiresAt;
    } else {
      const createdTime = new Date(createdAt).getTime();
      this.expiresAt = new Date(createdTime + duration * 1000);
    }
  }
}
