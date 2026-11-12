import { api } from './api';

/** A piece of text; `hit` marks the words matching the query. */
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
  createdAt: string;
  creator: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
  };
  speakers: string[];
  tags: string[];
}

export interface SearchHit {
  video: SearchVideo;
  titleParts: TextPart[];
  matchedIn: Array<'title' | 'tags' | 'people' | 'description' | 'transcript'>;
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

/**
 * Query parameters of `GET /api/search`, with the values as they appear in
 * the page URL (`tags` and `users` are comma-separated).
 */
export interface SearchParams {
  q?: string;
  tags?: string;
  users?: string;
  dateFrom?: string;
  dateTo?: string;
  favoris?: boolean;
  archived?: boolean;
  sort?: 'relevance' | 'recent';
  limit?: number;
  offset?: number;
}

/** Error thrown for a non-2xx response; `status` is 0 when there is none. */
export class SearchApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'SearchApiError';
    this.status = status;
  }
}

async function get<T>(
  url: string,
  params: Record<string, string | number | boolean | undefined>,
): Promise<T> {
  const query = Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== '',
    ),
  );
  const response = await api.get<T>(url, query);
  if (!response.ok) {
    throw new SearchApiError(
      `Request to ${url} failed (${response.problem})`,
      response.status ?? 0,
    );
  }
  return response.data as T;
}

export const searchContent = (params: SearchParams): Promise<SearchResult> =>
  get<SearchResult>('/search', { ...params });

export const getTranscript = (
  videoId: string,
  q?: string,
): Promise<TranscriptResult> =>
  get<TranscriptResult>(`/videos/${encodeURIComponent(videoId)}/transcript`, {
    q,
  });
