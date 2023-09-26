//MAke a User Entity using typeORM from nestjs documentation
// Include un the db a firstname, lastname, email and role fields

// Path: backend/src/entities/user.entity.ts

import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { Event } from '../events/event.entity';

@Entity()
export class User {
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

  @OneToMany(() => Event, (event) => event.creator, { cascade: true })
  events: Event[];

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  constructor(user: Partial<User>) {
    Object.assign(this, user);
  }
}
