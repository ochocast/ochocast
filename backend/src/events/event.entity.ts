//Make a Event entity using typeORM from nestjs documentation
// Include in the db a name, description, category, tags, date, published boolenan, private boolean, closed boolean, an imageslug as string and a foreign key to the user id as creator

// Path: backend/src/entities/event.entity.ts

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Track } from '../tracks/track.entity';

@Entity()
export class Event {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  description: string;

  @Column()
  category: string;

  @Column()
  tags: string;

  @Column()
  startDate: Date;

  @Column()
  endDate: Date;

  @Column()
  published: boolean;

  @Column()
  private: boolean;

  @Column()
  closed: boolean;

  @Column()
  imageSlug: string;

  @OneToMany(() => Track, (track) => track.event, { cascade: true })
  tracks: Track[];

  @ManyToOne(() => User, (user) => user.events) // , { cascade: true })
  creator: User;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  constructor(event: Partial<Event>) {
    Object.assign(this, event);
  }
}
