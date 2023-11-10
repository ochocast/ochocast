export default interface Event {
  id: number;
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
};

export interface Track {
  id: number;
  name: string;
  description: string;
  keywords: string;
  streamkey: string;
  closed: boolean;
  event: Event;
  createdAt: Date;
};

export interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  events: Event[];
  createdAt: Date;
};
