import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { UserEntity } from '../../../../users/infra/gateways/entities/user.entity';
import { TrackEntity } from '../../../../tracks/infra/gateways/entities/track.entity';
import { TagEntity } from '../../../../tags/infra/gateways/entities/tag.entity';

@Entity()
export class EventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  description: string;

  @ManyToMany(() => TagEntity, { cascade: true })
  @JoinTable()
  tags: TagEntity[];

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
  creator: UserEntity;

  @Column()
  creatorId: string;

  @ManyToMany(() => UserEntity, (user) => user.eventsSubscribe, {
    cascade: true,
  })
  @JoinTable()
  usersSubscribe: UserEntity[];

  @Column()
  createdAt: Date;

  constructor(event: Partial<EventEntity>) {
    Object.assign(this, event);
  }
}
