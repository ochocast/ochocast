export default interface Event {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string;
  startDate: Date;
  endDate: Date;
  published: boolean;
  private: boolean;
  closed: boolean;
  imageSlug: string;
  tracks: Track[];
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
