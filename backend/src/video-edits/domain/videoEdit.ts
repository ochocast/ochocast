import { ApiProperty } from '@nestjs/swagger';

export const RENDER_STATUSES = [
  'draft',
  'pending',
  'processing',
  'ready',
  'failed',
] as const;
export type RenderStatus = (typeof RENDER_STATUSES)[number];

/** While a render runs, the montage cannot change (409). */
export const RENDER_IN_PROGRESS: readonly RenderStatus[] = [
  'pending',
  'processing',
];

// The three choices of the mockup (docs/montage-video/maquette).
export const TEXT_POSITIONS = ['top', 'center', 'bottom'] as const;
export type TextPosition = (typeof TEXT_POSITIONS)[number];
export const TEXT_COLORS = ['white', 'black', 'green'] as const;
export type TextColor = (typeof TEXT_COLORS)[number];

export const VIDEO_EDIT_LIMITS = {
  /** Seconds. Also enforced by a database CHECK. */
  minSegmentDuration: 1,
  maxSegments: 100,
  maxTextLayersPerSegment: 10,
  maxTextLength: 500,
} as const;

/** A text layer as sent by the client: times relative to its segment. */
export interface TextLayerInput {
  content: string;
  position: TextPosition;
  color: TextColor;
  startOffset: number;
  duration: number;
}

/** A segment as sent by the client, in playback order. */
export interface SegmentInput {
  sourceStart: number;
  sourceEnd: number;
  textLayers: TextLayerInput[];
}

export class TextLayerObject {
  @ApiProperty({ example: 'b1f0c4b2-3c9e-4d6f-9a51-6a3f3b0e7d21' })
  id: string;

  @ApiProperty({ example: 'Partie 2 : démonstration' })
  content: string;

  @ApiProperty({ enum: TEXT_POSITIONS, example: 'bottom' })
  position: TextPosition;

  @ApiProperty({ enum: TEXT_COLORS, example: 'white' })
  color: TextColor;

  @ApiProperty({
    example: 0,
    description: 'Seconds from the start of its segment.',
  })
  startOffset: number;

  @ApiProperty({ example: 300, description: 'Seconds.' })
  duration: number;
}

export class SegmentObject {
  @ApiProperty({ example: '0d7a3a59-7d43-4bd0-8b0e-1f5b35f8a1c4' })
  id: string;

  @ApiProperty({
    example: 0,
    description: 'Playback order in the edited video, from 0.',
  })
  position: number;

  @ApiProperty({ example: 120, description: 'Seconds in the source video.' })
  sourceStart: number;

  @ApiProperty({ example: 870, description: 'Seconds in the source video.' })
  sourceEnd: number;

  @ApiProperty({ type: [TextLayerObject] })
  textLayers: TextLayerObject[];
}

export class VideoEditObject {
  @ApiProperty({ example: '6c1f3f8e-2b7a-4d0e-9d55-3f0e5b2a9c11' })
  id: string;

  @ApiProperty({ example: 'ad1b1aa3-d2b3-4041-bfe9-a511bcbe27a2' })
  videoId: string;

  @ApiProperty({ enum: RENDER_STATUSES, example: 'draft' })
  renderStatus: RenderStatus;

  @ApiProperty({ required: false, nullable: true })
  renderError: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    description: 'Media of the rendered version, once a render is ready.',
  })
  renderedMediaId: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    description: 'Seconds of the rendered version viewers get.',
  })
  renderedDuration: number | null;

  @ApiProperty({
    example: 1,
    description: 'Send it back with PUT: a stale version is refused (409).',
  })
  version: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ type: [SegmentObject] })
  segments: SegmentObject[];
}

export class RenderStatusObject {
  @ApiProperty({ example: 'ad1b1aa3-d2b3-4041-bfe9-a511bcbe27a2' })
  videoId: string;

  @ApiProperty({ enum: RENDER_STATUSES, example: 'pending' })
  renderStatus: RenderStatus;

  @ApiProperty({ required: false, nullable: true })
  renderError: string | null;

  @ApiProperty({ example: 2 })
  version: number;

  @ApiProperty()
  updatedAt: Date;
}
