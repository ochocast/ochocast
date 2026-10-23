import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  ManyToMany,
  JoinTable,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from '../../../../users/infra/gateways/entities/user.entity';
import { TagEntity } from 'src/tags/infra/gateways/entities/tag.entity';
import { CommentEntity } from 'src/comments/infra/gateways/entities/comment.entity';

@Entity()
export class VideoEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  media_id: string;

  @Column()
  miniature_id: string;

  @Column({ nullable: true })
  subtitle_id: string;

  @Column()
  title: string;

  @Column()
  description: string;

  // No cascade: the gateway resolves and creates tags before saving a video,
  // and a cascade would let a client tag object update the shared tag row.
  @ManyToMany(() => TagEntity, (tag) => tag.videos)
  @JoinTable() // Indique que cette entité gère la table de jointure
  tags: TagEntity[];

  @ManyToOne(() => UserEntity, (user) => user.videos)
  creator: UserEntity;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToMany(() => UserEntity)
  @JoinTable()
  internal_speakers: UserEntity[];

  @Column()
  external_speakers: string;

  @Column()
  views: number;

  @Column({ type: 'float', nullable: true })
  duration: number;

  @Column({ default: 'ready' })
  transcoding_status: 'pending' | 'ready' | 'failed';

  @Column({ nullable: true, type: 'text' })
  transcoding_error: string | null;

  @OneToMany(() => CommentEntity, (comment) => comment.video)
  comments: CommentEntity[];

  @Column()
  archived: boolean;

  constructor(video: Partial<VideoEntity>) {
    Object.assign(this, video);
  }

  @ManyToMany(() => UserEntity, (user) => user.favoriteVideos)
  usersWhoFavorited: UserEntity[];
}
