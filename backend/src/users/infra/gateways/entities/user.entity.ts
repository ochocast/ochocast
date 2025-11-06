import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  OneToMany,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { EventEntity } from '../../../../events/infra/gateways/entities/event.entity';
import { CommentEntity } from '../../../../comments/infra/gateways/entities/comment.entity';
import { VideoEntity } from 'src/videos/infra/gateways/entities/video.entity';
import { TrackEntity } from 'src/tracks/infra/gateways/entities/track.entity';
import { Comment } from 'typedoc';

@Entity()
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  username: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ unique: true })
  email: string;

  @Column()
  role: string;

  @Column({
    nullable: true,
  })
  description: string;

  @OneToMany(() => EventEntity, (event) => event.creator, { cascade: true })
  events: EventEntity[];

  @OneToMany(() => CommentEntity, (comment) => comment.creator, {
    cascade: true,
  })
  comments: CommentEntity[];

  @OneToMany(() => VideoEntity, (video) => video.creator, { cascade: true })
  videos: VideoEntity[];

  @ManyToMany(() => VideoEntity, (video) => video.internal_speakers)
  videosAsSpeaker: VideoEntity[];

  @Column()
  createdAt: Date;

  @Column({ type: 'varchar', nullable: true })
  picture_id: string;

  @ManyToMany(() => TrackEntity, (track) => track.speakers)
  speakingTracks: TrackEntity[];

  @ManyToMany(() => EventEntity, (event) => event.usersSubscribe)
  eventsSubscribe: EventEntity[];

  @ManyToMany(() => VideoEntity, (video) => video.usersWhoFavorited)
  @JoinTable({
    name: 'user_favorite_videos',
    joinColumn: {
      name: 'user_id',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'video_id',
      referencedColumnName: 'id',
    },
  })
  favoriteVideos: VideoEntity[];

  @ManyToMany(() => CommentEntity, (comment) => comment.usersWhoLiked)
  @JoinTable({
    name: 'user_liked_videos',
    joinColumn: {
      name: 'user_id',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'comment_id',
      referencedColumnName: 'id',
    },
  })
  likedComments: CommentEntity[];

  constructor(user: Partial<UserEntity>) {
    Object.assign(this, user);
  }
}
