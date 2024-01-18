import { EventObject } from '../../events/domain/event';
import { ApiProperty } from '@nestjs/swagger';

export class UserObject {
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
    example: [EventObject],
    description: 'The events owned by the user.',
  })
  events: EventObject[];

  @ApiProperty({
    example: '2021-10-31T00:00:00.000Z',
    description: 'The date the user was created.',
  })
  createdAt: Date;

  constructor(
    id: string,
    firstName: string,
    lastName: string,
    email: string,
    role: string,
    events: EventObject[],
    createdAt: Date,
  ) {
    this.id = id;
    this.firstName = firstName;
    this.lastName = lastName;
    this.email = email;
    this.role = role;
    this.events = events;
    this.createdAt = createdAt;
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
