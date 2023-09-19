//Make a Event entity using typeORM from nestjs documentation
// Include in the db a name, description, category, tags, date, published boolenan, private boolean, closed boolean, an imageslug as string and a foreign key to the user id as creator

// Path: backend/src/entities/event.entity.ts

import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';
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

  @Column('json', { array: true, default: [] })
  tracks: TrackEntity[];

  @ManyToOne(() => UserEntity, (user) => user.events)
  creator: UserEntity;
}
