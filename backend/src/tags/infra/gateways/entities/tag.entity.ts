import { Entity, Column, PrimaryGeneratedColumn, ManyToMany } from 'typeorm';
import { EventEntity } from '../../../../events/infra/gateways/entities/event.entity';

@Entity()
export class TagEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @ManyToMany(() => EventEntity, (event) => event.tags, {
    onDelete: 'CASCADE',
  })
  videos: string[];

  @Column()
  createdAt: Date;

  @Column()
  updatedAt: Date;

  constructor(tag: Partial<TagEntity>) {
    Object.assign(this, tag);
  }
}
