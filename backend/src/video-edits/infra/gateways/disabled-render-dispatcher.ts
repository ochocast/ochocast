import { Injectable } from '@nestjs/common';
import { IVideoEditRenderDispatcher } from '../../domain/gateways/render-dispatcher.gateway';
import { VideoEditRenderMessage } from '../../domain/videoEditRenderJob';

/** Without a render queue, saving a montage answers 503 without writing. */
@Injectable()
export class DisabledVideoEditRenderDispatcher implements IVideoEditRenderDispatcher {
  readonly enabled = false;

  async publish(message: VideoEditRenderMessage): Promise<void> {
    throw new Error(`Video rendering is not available (job ${message.jobId})`);
  }
}
