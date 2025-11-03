export default interface Event {
  id: string;
  name: string;
  description: string;
  tags: Tag_event[];
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
  usersSubscribe: PublicUser[];
  // eslint-disable-next-line
}

export interface Tag_event {
  id: string;
  name: string;
}

export interface Track {
  id: string;
  name: string;
  description: string;
  keywords: string;
  streamKey: string;
  closed: boolean;
  speakers: PublicUser[];
  event: PublicEvent;
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
  tags: Tag_event[];
  startDate: Date;
  endDate: Date;
  published: boolean;
  private: boolean;
  closed: boolean;
  imageSlug: string;
  tracks: Track[];
  creatorId: string;
  canBeEditByUser: boolean;
  creator: PublicUser;
  nbSubscription: number;
  subscribedUserIds?: string[];
}

export interface PublicUser {
  id: string;
  firstName: string;
  lastName: string;
}

export const eventToPublicEvent = (event: Event): PublicEvent => {
  return {
    id: event.id,
    name: event.name,
    description: event.description,
    tags: event.tags,
    startDate: event.startDate,
    endDate: event.endDate,
    published: event.published,
    private: event.private,
    closed: event.closed,
    imageSlug: event.imageSlug,
    tracks: event.tracks,
    creatorId: event.creatorId,
    canBeEditByUser: true,
    creator: {
      id: event.creatorId,
      firstName: event.creator?.firstName,
      lastName: event.creator?.lastName,
    },
    nbSubscription: event.usersSubscribe.length,
  };
};
