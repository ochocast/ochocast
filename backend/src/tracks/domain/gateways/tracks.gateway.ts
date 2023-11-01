import { TrackObject } from '../track';

export interface ITrackGateway {
  createNewTrack: (track: TrackObject) => Promise<TrackObject>;
  getTracks: (filter: any) => Promise<TrackObject[]>;
}
