export type QueryGroup =
  | { kind: 'terms'; alternatives: string[] }
  | { kind: 'phrase'; text: string };

export interface ParsedQuery {
  raw: string;
  groups: QueryGroup[];
  excluded: string[];
  isEmpty: boolean;
}

export interface SearchFilters {
  tags: string[];
  users: string[];
  dateFrom?: Date;
  dateTo?: Date;
  favoris: boolean;
  archived: boolean;
}

export interface Page {
  limit: number;
  offset: number;
  sort: 'relevance' | 'recent';
}

export interface Viewer {
  userId: string;
  isAdmin: boolean;
}

export type MatchedIn =
  | 'title'
  | 'tags'
  | 'people'
  | 'description'
  | 'transcript';

export interface TextPart {
  text: string;
  hit: boolean;
}

export interface Passage {
  start: number;
  end: number;
  best: boolean;
  parts: TextPart[];
}

export interface SearchVideo {
  id: string;
  title: string;
  miniature_id: string;
  duration: number;
  views: number;
  createdAt: string | Date;
  creator: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
  } | null;
  speakers: string[];
  tags: string[];
}

export interface SearchHit {
  video: SearchVideo;
  titleParts: TextPart[];
  matchedIn: MatchedIn[];
  score: number;
  passageCount: number;
  passages: Passage[];
}

export interface SearchResult {
  query: string;
  total: number;
  passageTotal: number;
  videos: SearchHit[];
}

export interface TranscriptSegment {
  start: number;
  end: number;
  parts: TextPart[];
}

export interface TranscriptResult {
  videoId: string;
  source: 'auto' | 'provided';
  status: 'ready' | 'pending' | 'none';
  segments: TranscriptSegment[];
  matches: number[];
}
