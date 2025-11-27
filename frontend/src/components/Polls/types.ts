import { User } from '../../types/user';

export interface Poll {
  id: string;
  question: string;
  responses: string[];
  status: 'active' | 'closed' | 'archived';
  duration: number;
  trackId: string;
  createdAt: Date | string;
  expiresAt: Date | string;
  createdBy: User;
  voteCount: Record<number, number>;
  totalVotes: number;
}
