//MAke a User Entity using typeORM from nestjs documentation
// Include un the db a firstname, lastname, email and role fields

// Path: backend/src/entities/user.entity.ts

import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { EventEntity } from './event.entity';

@Entity()
export class UserEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ unique: true })
  email: string;

  @Column()
  role: string;

  @OneToMany(() => EventEntity, (event) => event.creator, { cascade: true })
  events: EventEntity[];

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  constructor(user: Partial<UserEntity>) {
    Object.assign(this, user);
  }
}
