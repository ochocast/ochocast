//Make a track entity using typeORM from nestjs documentation
//Include in the table a name, description, keywords, stramkey, closed boolean and a foreign key to the event id as event

// Path: backend/src/entities/track.entity.ts

import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';
import { EventEntity } from './event.entity';

@Entity()
export class TrackEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  description: string;

  @Column()
  keywords: string;

  @Column()
  streamkey: string;

  @Column()
  closed: boolean;

  @ManyToOne(() => EventEntity, (event) => event.tracks)
  event: EventEntity;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  constructor(track: Partial<TrackEntity>) {
    Object.assign(this, track);
  }
}
