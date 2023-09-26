//Make a superUser entity using typeORM from nestjs documentation
//Include in the table a username, and a password as string that must encrypted before being stored in the db

// Path: backend/src/entities/superUser.entity.ts

import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class SuperUser {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  username: string;

  @Column()
  password: string;
}
