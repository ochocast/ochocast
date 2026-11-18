import {
  Page,
  ParsedQuery,
  SearchFilters,
  SearchResult,
  TranscriptResult,
  Viewer,
} from '../search.types';

/** Injection token of the `SearchGateway` port. */
export const SEARCH_GATEWAY = 'SearchGateway';

export interface SearchGateway {
  search(
    q: ParsedQuery,
    filters: SearchFilters,
    page: Page,
    viewer: Viewer,
  ): Promise<SearchResult>;
  /** Null when the video does not exist or the viewer may not see it. */
  transcript(
    videoId: string,
    q: ParsedQuery | null,
    viewer: Viewer,
  ): Promise<TranscriptResult | null>;
}
