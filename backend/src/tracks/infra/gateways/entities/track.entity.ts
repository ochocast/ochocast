import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinTable,
  ManyToMany,
} from 'typeorm';
import { EventEntity } from '../../../../events/infra/gateways/entities/event.entity';
import { UserEntity } from '../../../../users/infra/gateways/entities/user.entity';

@Entity()
export class TrackEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  description: string;

  @Column('text', { array: true })
  keywords: string[];

  @Column()
  streamKey: string;

  @Column()
  closed: boolean = false;

  @ManyToOne(() => EventEntity, (event) => event.tracks, {
    onDelete: 'CASCADE',
  })
  event: EventEntity;

  @Column()
  createdAt: Date;

  @Column({
    nullable: true,
  })
  startDate: Date;

  @Column({
    nullable: true,
  })
  endDate: Date;

  @Column()
  eventId: string;

  @ManyToMany(() => UserEntity, (user) => user.speakingTracks, {
    eager: false,
  })
  @JoinTable()
  speakers: UserEntity[];

  constructor(track: Partial<TrackEntity>) {
    Object.assign(this, track);
  }
}
