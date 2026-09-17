import { ApiProperty } from '@nestjs/swagger';

/**
 * Visibility of a track recording (segment).
 * - `unlisted`: default state after capture; only reachable by the organizer.
 * - `published`: the segment (or its merge) has been published on a channel.
 */
export type RecordingVisibility = 'unlisted' | 'published';

/**
 * Kind of recording:
 * - `segment`: a raw captured segment of the live.
 * - `merged`: the result of merging several segments (US-3).
 */
export type RecordingKind = 'segment' | 'merged';

/**
 * Processing status. Segments are `ready` immediately; a merged recording is
 * `processing` until the worker has produced the concatenated file.
 */
export type RecordingStatus = 'ready' | 'processing' | 'failed';

/**
 * Domain object for a recording of a track (a raw segment or a merge).
 *
 * A track produces one or more recording segments (a crash of the live simply
 * yields several segments). Each segment is captured as `unlisted` and stays
 * visible to the organizer only, until it is merged and/or published.
 */
export class RecordingObject {
  @ApiProperty({
    example: 'ad1b1aa3-d2b3-4041-bfe9-a511bcbe27a2',
    description: 'The unique identifier of the recording.',
  })
  id: string;

  @ApiProperty({
    example: '4ea6d8c0-8819-4378-bfee-98bd1bd50be0',
    description: 'The unique identifier of the parent track.',
  })
  trackId: string;

  @ApiProperty({
    example: 'ad1b1aa3-d2b3-4041-bfe9-a511bcbe27a2',
    description: 'The id of the stored media file (MinIO/S3).',
  })
  mediaId: string;

  @ApiProperty({
    example: 'unlisted',
    description: "Visibility of the recording: 'unlisted' or 'published'.",
  })
  visibility: RecordingVisibility;

  @ApiProperty({
    example: false,
    description:
      'Whether the segment was detected as problematic (truncated / unreadable file, typically after a brutal stop). Surfaced as a warning to the organizer; never auto-rejected.',
  })
  problematic: boolean;

  @ApiProperty({
    example: 0,
    description:
      'Chronological index of the segment within the track, used as the default merge order.',
  })
  segmentIndex: number;

  @ApiProperty({
    example: 128.4,
    description: 'Duration of the recording in seconds, if known.',
    required: false,
  })
  duration: number | null;

  @ApiProperty({
    example: '2026-02-20T00:00:00.000Z',
    description: 'The date the recording was captured or created.',
  })
  createdAt: Date;

  @ApiProperty({
    example: 'segment',
    description: "Kind of recording: 'segment' or 'merged'.",
  })
  kind: RecordingKind;

  @ApiProperty({
    example: 'ready',
    description: "Processing status: 'ready', 'processing' or 'failed'.",
  })
  status: RecordingStatus;

  @ApiProperty({
    description:
      'For a merged recording, the source segment ids in merge order.',
    required: false,
  })
  sourceSegmentIds: string[] | null;

  constructor(
    id: string,
    trackId: string,
    mediaId: string,
    visibility: RecordingVisibility,
    problematic: boolean,
    segmentIndex: number,
    duration: number | null,
    createdAt: Date,
    kind: RecordingKind = 'segment',
    status: RecordingStatus = 'ready',
    sourceSegmentIds: string[] | null = null,
  ) {
    this.id = id;
    this.trackId = trackId;
    this.mediaId = mediaId;
    this.visibility = visibility;
    this.problematic = problematic;
    this.segmentIndex = segmentIndex;
    this.duration = duration;
    this.createdAt = createdAt;
    this.kind = kind;
    this.status = status;
    this.sourceSegmentIds = sourceSegmentIds;
  }
}
