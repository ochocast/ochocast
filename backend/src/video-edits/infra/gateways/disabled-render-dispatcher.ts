import { Injectable } from '@nestjs/common';
import {
  IVideoEditRenderDispatcher,
  VideoEditRenderJob,
} from '../../domain/gateways/render-dispatcher.gateway';

/**
 * Rendering arrives with the FFmpeg step. Until then saving a montage
 * answers 503 instead of leaving it `pending` with nothing to render it.
 */
@Injectable()
export class DisabledVideoEditRenderDispatcher implements IVideoEditRenderDispatcher {
  readonly enabled = false;

  async dispatch(job: VideoEditRenderJob): Promise<void> {
    throw new Error(`Video rendering is not available (job ${job.jobId})`);
  }
}
