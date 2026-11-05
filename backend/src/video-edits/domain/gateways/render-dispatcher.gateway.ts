import { VideoEditRenderMessage } from '../videoEditRenderJob';

/** Port: publishes a registered render job to the render queue. */
export interface IVideoEditRenderDispatcher {
  /** False when no render queue is configured on this environment. */
  readonly enabled: boolean;
  publish(message: VideoEditRenderMessage): Promise<void>;
}
