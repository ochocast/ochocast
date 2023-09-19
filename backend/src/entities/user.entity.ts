//MAke a User Entity using typeORM from nestjs documentation
// Include un the db a firstname, lastname, email and role fields

// Path: backend/src/entities/user.entity.ts

import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { EventEntity } from './event.entity';

@Entity()
export class UserEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column()
  email: string;

  @Column()
  role: string;

  @Column('json', { array: true, default: [] })
  events: EventEntity[];
}
