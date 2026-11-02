import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  Unique,
} from 'typeorm';
import { VideoEditEntity } from './video-edit.entity';
import { VideoEditTextLayerEntity } from './video-edit-text-layer.entity';

/** A passage of the source video, at `position` in the edited video. */
@Entity('video_edit_segment')
@Unique('UQ_video_edit_segment_position', ['editId', 'position'])
export class VideoEditSegmentEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column('uuid')
  editId: string;

  @ManyToOne(() => VideoEditEntity, (edit) => edit.segments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'editId' })
  edit: VideoEditEntity;

  @Column('integer')
  position: number;

  /** Seconds in the source video. */
  @Column('double precision')
  source_start: number;

  @Column('double precision')
  source_end: number;

  @OneToMany(() => VideoEditTextLayerEntity, (layer) => layer.segment)
  textLayers: VideoEditTextLayerEntity[];
}
