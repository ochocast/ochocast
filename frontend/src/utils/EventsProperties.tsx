export default interface Event {
  id: string;
  name: string;
  description: string;
  tags: string;
  startDate: Date;
  endDate: Date;
  published: boolean;
  private: boolean;
  closed: boolean;
  imageSlug: string;
  tracks: Track[];
  creatorId: string;
  creator: User;
  createdAt: Date;
  // eslint-disable-next-line
}

export interface Track {
  id: string;
  name: string;
  description: string;
  keywords: string;
  streamKey: string;
  closed: boolean;
  speakers: string[];
  event: Event;
  createdAt: Date;
  startDate: Date;
  endDate: Date;
}

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  events: Event[];
  createdAt: Date;
}

export interface PublicEvent {
  id: string;
  name: string;
  description: string;
  tags: string;
  startDate: Date;
  endDate: Date;
  published: boolean;
  private: boolean;
  closed: boolean;
  imageSlug: string;
  tracks: PublicTrack[];
  creatorId: string;
  canBeEditByUser : boolean;
  creator: PublicUser;
}

export interface PublicTrack {
  id: string;
  name: string;
  description: string;
  keywords: string;
  streamKey: string;
  closed: boolean;
  eventId: string;
  createdAt: Date;
  speakers: PublicUser[];
}

export interface PublicUser {
  id: string;
  firstName: string;
  lastName: string;
}
