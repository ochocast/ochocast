import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import {
  IVideoEditGateway,
  ReplaceContentOptions,
  ReplaceContentResult,
} from '../../domain/gateways/video-edits.gateway';
import {
  RENDER_IN_PROGRESS,
  SegmentInput,
  VideoEditObject,
} from '../../domain/videoEdit';
import { VideoEditEntity } from './entities/video-edit.entity';
import { VideoEditSegmentEntity } from './entities/video-edit-segment.entity';
import { VideoEditTextLayerEntity } from './entities/video-edit-text-layer.entity';

const isDuplicateMontage = (error: unknown) =>
  error instanceof QueryFailedError &&
  (error as any).driverError?.code === '23505' &&
  (error as any).driverError?.table === 'video_edit';

export function toVideoEditObject(entity: VideoEditEntity): VideoEditObject {
  const segments = [...(entity.segments ?? [])].sort(
    (a, b) => a.position - b.position,
  );
  return {
    id: entity.id,
    videoId: entity.videoId,
    renderStatus: entity.render_status,
    renderError: entity.render_error,
    renderedMediaId: entity.rendered_media_id,
    version: entity.version,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    segments: segments.map((segment) => ({
      id: segment.id,
      position: segment.position,
      sourceStart: segment.source_start,
      sourceEnd: segment.source_end,
      textLayers: [...(segment.textLayers ?? [])]
        .sort(
          (a, b) => a.start_offset - b.start_offset || a.id.localeCompare(b.id),
        )
        .map((layer) => ({
          id: layer.id,
          content: layer.content,
          position: layer.position,
          color: layer.color,
          startOffset: layer.start_offset,
          duration: layer.duration,
        })),
    })),
  };
}

@Injectable()
export class VideoEditGateway implements IVideoEditGateway {
  constructor(private readonly dataSource: DataSource) {}

  async findByVideoId(
    videoId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<VideoEditObject | null> {
    const entity = await manager.getRepository(VideoEditEntity).findOne({
      where: { videoId },
      relations: { segments: { textLayers: true } },
    });
    return entity ? toVideoEditObject(entity) : null;
  }

  async create(
    videoId: string,
    segments: SegmentInput[],
  ): Promise<VideoEditObject | null> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const id = randomUUID();
        await manager.getRepository(VideoEditEntity).insert({
          id,
          videoId,
          render_status: 'draft',
          version: 1,
        });
        await this.insertContent(manager, id, segments);
        return this.findByVideoId(videoId, manager);
      });
    } catch (error) {
      // Two concurrent creations: UNIQUE ("videoId") lets only one through.
      if (isDuplicateMontage(error)) return null;
      throw error;
    }
  }

  async replaceContent(
    videoId: string,
    segments: SegmentInput[],
    options: ReplaceContentOptions,
  ): Promise<ReplaceContentResult> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(VideoEditEntity);
      // Serializes writers: the version and status checks hold until commit.
      const edit = await repository.findOne({
        where: { videoId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!edit) return { status: 'not_found' as const };
      if (RENDER_IN_PROGRESS.includes(edit.render_status)) {
        return {
          status: 'render_in_progress' as const,
          renderStatus: edit.render_status,
        };
      }
      if (
        options.expectedVersion !== undefined &&
        edit.version !== options.expectedVersion
      ) {
        return {
          status: 'version_conflict' as const,
          currentVersion: edit.version,
        };
      }

      // Text layers go with their segments (ON DELETE CASCADE).
      await manager
        .getRepository(VideoEditSegmentEntity)
        .delete({ editId: edit.id });
      await this.insertContent(manager, edit.id, segments);
      await repository.update(edit.id, {
        version: edit.version + 1,
        render_status: options.renderStatus,
        render_error: null,
        ...(options.clearRenderedMedia ? { rendered_media_id: null } : {}),
      });
      return {
        status: 'ok' as const,
        edit: await this.findByVideoId(videoId, manager),
      };
    });
  }

  async markRenderFailed(
    editId: string,
    version: number,
    error: string,
  ): Promise<void> {
    await this.dataSource
      .getRepository(VideoEditEntity)
      .update(
        { id: editId, version, render_status: 'pending' },
        { render_status: 'failed', render_error: error },
      );
  }

  private async insertContent(
    manager: EntityManager,
    editId: string,
    segments: SegmentInput[],
  ): Promise<void> {
    const segmentRows: Partial<VideoEditSegmentEntity>[] = [];
    const layerRows: Partial<VideoEditTextLayerEntity>[] = [];
    segments.forEach((segment, position) => {
      const segmentId = randomUUID();
      segmentRows.push({
        id: segmentId,
        editId,
        position,
        source_start: segment.sourceStart,
        source_end: segment.sourceEnd,
      });
      for (const layer of segment.textLayers ?? []) {
        layerRows.push({
          id: randomUUID(),
          segmentId,
          content: layer.content.trim(),
          position: layer.position,
          color: layer.color,
          start_offset: layer.startOffset,
          duration: layer.duration,
        });
      }
    });
    if (segmentRows.length > 0) {
      await manager.getRepository(VideoEditSegmentEntity).insert(segmentRows);
    }
    if (layerRows.length > 0) {
      await manager.getRepository(VideoEditTextLayerEntity).insert(layerRows);
    }
  }
}
