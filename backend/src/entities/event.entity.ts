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
import { UserEntity } from './user.entity';
import { TrackEntity } from './track.entity';

@Entity()
export class EventEntity {
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
  date: Date;

  @Column()
  published: boolean;

  @Column()
  private: boolean;

  @Column()
  closed: boolean;

  @Column()
  imageslug: string;

  @OneToMany(() => TrackEntity, (track) => track.event, { cascade: true })
  tracks: TrackEntity[];

  @ManyToOne(() => UserEntity, (user) => user.events)
  creator: UserEntity;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  constructor(event: Partial<EventEntity>) {
    Object.assign(this, event);
  }
}
