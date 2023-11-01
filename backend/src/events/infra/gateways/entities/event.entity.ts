import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { UserEntity } from '../../../../users/infra/gateways/entities/user.entity';
import { TrackEntity } from '../../../../tracks/infra/gateways/entities/track.entity';

@Entity()
export class EventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  description: string;

  @Column()
  category: string;

  @Column('text', { array: true })
  tags: string[];

  @Column()
  startDate: Date;

  @Column()
  endDate: Date;

  @Column()
  published: boolean = false;

  @Column()
  isPrivate: boolean = true;

  @Column()
  closed: boolean = false;

  @Column()
  imageSlug: string;

  @OneToMany(() => TrackEntity, (track) => track.event, { cascade: true })
  tracks: TrackEntity[];

  @ManyToOne(() => UserEntity, (user) => user.events)
  creator: string;

  @Column()
  createdAt: Date;

  constructor(event: Partial<EventEntity>) {
    Object.assign(this, event);
  }
}
