export interface Video {
    id: string;
    media_id: string;
    title: string;
    description: string;
    creator: User;
    createdAt: Date;
    updatedAt: Date;
    internal_speakers: string;
    external_speakers: string;
    views: number;
  }
  
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  createdAt: Date;
  description: string;
}

export interface Tag_video{
  id: string;
  name: string;
}