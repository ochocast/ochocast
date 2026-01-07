import { Entity, Column, PrimaryGeneratedColumn, ManyToMany } from 'typeorm';
import { VideoEntity } from 'src/videos/infra/gateways/entities/video.entity';

@Entity()
export class TagEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @ManyToMany(() => VideoEntity, (video) => video.tags)
  videos: VideoEntity[];

  @Column()
  createdAt: Date;

  @Column()
  updatedAt: Date;

  constructor(tag: Partial<TagEntity>) {
    Object.assign(this, tag);
  }
}
