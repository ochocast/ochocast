import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';
import { EventEntity } from '../../../../events/infra/gateways/entities/event.entity';

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
  event: string;

  @Column()
  createdAt: Date;

  constructor(track: Partial<TrackEntity>) {
    Object.assign(this, track);
  }
}
