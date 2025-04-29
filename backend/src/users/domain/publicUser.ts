import { ApiProperty } from '@nestjs/swagger';
import { UserObject } from './user';

export class PublicUserObject {
  @ApiProperty({
    example: 'e43dadbd-1006-4556-8f70-98225d569fa2',
    description: 'The unique identifier of the user.',
  })
  id: string;

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
    example: 'I am very kind and respectful',
    description: 'The description of a user.',
  })
  description: string;

  @ApiProperty({
    example: 'ad1b1aa3-d2b3-4041-bfe9-a511bcbe27a2',
    description: 'The id of the profile picture.',
  })
  picture_id: string;

  constructor(user: UserObject) {
    this.id = user.id;
    this.firstName = user.firstName;
    this.lastName = user.lastName;
    this.description = user.description;
    this.picture_id = user.picture_id;
  }
}
