import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { TextColor, TextPosition } from '../../../domain/videoEdit';
import { VideoEditSegmentEntity } from './video-edit-segment.entity';

/** A text shown over a segment; it moves with its segment. */
@Entity('video_edit_text_layer')
export class VideoEditTextLayerEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Index('IDX_video_edit_text_layer_segment')
  @Column('uuid')
  segmentId: string;

  @ManyToOne(() => VideoEditSegmentEntity, (segment) => segment.textLayers, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'segmentId' })
  segment: VideoEditSegmentEntity;

  @Column('text')
  content: string;

  @Column({ default: 'bottom' })
  position: TextPosition;

  @Column({ default: 'white' })
  color: TextColor;

  /** Seconds from the start of its segment. */
  @Column('double precision')
  start_offset: number;

  @Column('double precision')
  duration: number;
}
