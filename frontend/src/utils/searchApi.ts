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

interface Answer {
  data: unknown;
  /** HTTP status, 0 when there is none. */
  status: number;
}

async function get(
  url: string,
  params: Record<string, string | number | boolean | undefined>,
): Promise<Answer> {
  const query = Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== '',
    ),
  );
  const response = await api.get<unknown>(url, query);
  if (!response.ok) {
    throw new SearchApiError(
      `Request to ${url} failed (${response.problem})`,
      response.status ?? 0,
    );
  }
  return { data: response.data, status: response.status ?? 0 };
}

export const searchContent = async (
  params: SearchParams,
): Promise<SearchResult> =>
  (await get('/search', { ...params })).data as SearchResult;

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const toParts = (raw: Json): TextPart[] => {
  const text = typeof raw.text === 'string' ? raw.text : '';
  const parts = Array.isArray(raw.parts)
    ? raw.parts
        .filter(isObject)
        .filter((part) => typeof part.text === 'string')
        .map((part) => ({ text: part.text as string, hit: part.hit === true }))
    : [];
  return parts.length > 0 ? parts : [{ text, hit: false }];
};

/**
 * Turns a 200 answer of the transcript route into a `TranscriptResult` the
 * panel can render whatever the body holds. `matches` index the raw segment
 * list: they are moved to the kept segments, and those of dropped segments
 * are dropped too.
 */
const toTranscript = (
  videoId: string,
  { data, status: httpStatus }: Answer,
): TranscriptResult => {
  if (!isObject(data)) {
    throw new SearchApiError('Malformed transcript', httpStatus);
  }
  const status =
    data.status === 'ready' || data.status === 'pending' ? data.status : 'none';
  const result: TranscriptResult = {
    videoId: typeof data.videoId === 'string' ? data.videoId : videoId,
    source: data.source === 'provided' ? 'provided' : 'auto',
    status,
    segments: [],
    matches: [],
  };
  if (status !== 'ready' || !Array.isArray(data.segments)) return result;

  const keptIndex: number[] = [];
  data.segments.forEach((raw: unknown, index) => {
    if (!isObject(raw) || !isFiniteNumber(raw.start)) return;
    keptIndex[index] = result.segments.length;
    result.segments.push({
      start: raw.start,
      end: isFiniteNumber(raw.end) ? raw.end : raw.start,
      parts: toParts(raw),
    });
  });
  if (Array.isArray(data.matches)) {
    const matches = new Set<number>();
    data.matches.forEach((index: unknown) => {
      if (Number.isInteger(index) && keptIndex[index as number] !== undefined) {
        matches.add(keptIndex[index as number]);
      }
    });
    result.matches = Array.from(matches).sort((a, b) => a - b);
  }
  return result;
};

export const getTranscript = async (
  videoId: string,
  q?: string,
): Promise<TranscriptResult> =>
  toTranscript(
    videoId,
    await get(`/videos/${encodeURIComponent(videoId)}/transcript`, { q }),
  );
