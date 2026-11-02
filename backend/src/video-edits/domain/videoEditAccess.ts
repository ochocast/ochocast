import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { IVideoGateway } from 'src/videos/domain/gateways/videos.gateway';
import { VideoObject } from 'src/videos/domain/video';

export interface VideoEditAccessDeps {
  videoGateway: IVideoGateway;
  userGateway: IUserGateway;
}

/**
 * Returns the video when `email` may edit it: its creator or an admin.
 * 404 for an unknown user or video (archived included), 403 otherwise.
 */
export async function getEditableVideo(
  deps: VideoEditAccessDeps,
  videoId: string,
  email: string,
): Promise<VideoObject> {
  const user = email ? await deps.userGateway.getUserByEmail(email) : null;
  if (!user) throw new NotFoundException(`User (email: ${email}) not found`);

  const videos = await deps.videoGateway.getVideos({ id: videoId });
  const video = videos?.[0];
  if (!video) throw new NotFoundException(`Video (id: ${videoId}) not found`);

  const isCreator = video.creator?.email === user.email;
  if (!isCreator && user.role !== 'admin') {
    throw new ForbiddenException('videonotallowedit');
  }
  return video;
}

/** Duration of a video that can be edited, or null when it cannot yet. */
export function editableDuration(video: VideoObject): number | null {
  const duration = Number(video.duration);
  if (video.transcoding_status !== 'ready') return null;
  if (!Number.isFinite(duration) || duration < 1) return null;
  return duration;
}
