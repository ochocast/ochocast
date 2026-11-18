import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { SearchGateway } from '../domain/gateways/search.gateway';
import { splitHighlight } from '../domain/highlight';
import {
  MatchedIn,
  Page,
  ParsedQuery,
  Passage,
  SearchFilters,
  SearchHit,
  SearchResult,
  SearchVideo,
  TranscriptResult,
  TranscriptSegment,
  Viewer,
} from '../domain/search.types';
import {
  buildTsQueries,
  EXACT_CONFIG,
  SEARCH_CONFIG,
  TsQueries,
} from './tsquery-builder';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CONFIG = `'${SEARCH_CONFIG.fr}'`;
const EXACT = `'${EXACT_CONFIG}'`;

/**
 * `ts_headline` options: the whole text, each hit wrapped in U+0002 ... U+0003
 * (read back by `splitHighlight`). A constant, never built from input.
 */
export const HIGHLIGHT_OPTIONS = `concat('HighlightAll=true, StartSel=', chr(2), ', StopSel=', chr(3))`;

// ts_rank_cd weights of D, C, B, A: transcript, description, tags and people, title.
const RANK_WEIGHTS = `'{0.1, 0.2, 0.4, 1.0}'`;
const EXACT_BONUS = 0.2;
const MAX_PASSAGES = 20;
const BEST_PASSAGES = 3;
// One budget for the whole search, shared by its statements.
const SEARCH_BUDGET_MS = 2000;

// The fields of a video that match q_any, in this order (`in_<field>` columns).
const FIELDS: MatchedIn[] = [
  'title',
  'tags',
  'people',
  'description',
  'transcript',
];
const MATCHED_IN = `array_remove(ARRAY[${FIELDS.map(
  (name) => `CASE WHEN in_${name} THEN '${name}' END`,
).join(', ')}], NULL)`;

// R17: every order ends with the id, so that pages never overlap.
const ORDER_BY: Record<Page['sort'], string> = {
  relevance: `level DESC, score DESC, "createdAt" DESC, id`,
  recent: `"createdAt" DESC, id`,
};

/** Appends a value to the statement's parameters and returns its placeholder. */
function bind(params: unknown[], value: unknown): string {
  params.push(value);
  return `$${params.length}`;
}

// Case, accents and surrounding spaces ignored, on both sides of a comparison.
const normalized = (sql: string) => `lower(unaccent(trim(${sql})))`;
const normalizedList = (param: string) =>
  `SELECT ${normalized('x')} FROM unnest(${param}::text[]) x`;

/** Conditions on `v` (video_entity): visibility, then the optional filters. */
function filterSql(
  filters: SearchFilters,
  viewer: Viewer,
  params: unknown[],
): string {
  // Defence in depth: archived videos only for an admin who asks for them.
  const archived = filters.archived && viewer.isAdmin;
  const conditions = [`v.archived = ${bind(params, archived)}`];
  if (filters.tags.length > 0) {
    conditions.push(`EXISTS (
      SELECT 1 FROM video_entity_tags_tag_entity vtt
      JOIN tag_entity t ON t.id = vtt."tagEntityId"
      WHERE vtt."videoEntityId" = v.id
        AND ${normalized('t.name')} IN (${normalizedList(bind(params, filters.tags))}))`);
  }
  if (filters.users.length > 0) {
    // The creator or an internal speaker, by any part of the name (never the e-mail).
    const names = ['u.username', 'u."firstName"', 'u."lastName"'];
    names.push(`u."firstName" || ' ' || u."lastName"`);
    conditions.push(`EXISTS (
      SELECT 1 FROM user_entity u
      WHERE (u.id = v."creatorId" OR u.id IN (
          SELECT s."userEntityId" FROM video_entity_internal_speakers_user_entity s
          WHERE s."videoEntityId" = v.id))
        AND ARRAY[${names.map(normalized).join(', ')}]
          && ARRAY(${normalizedList(bind(params, filters.users))}))`);
  }
  if (filters.dateFrom) {
    conditions.push(`v."createdAt" >= ${bind(params, filters.dateFrom)}`);
  }
  if (filters.dateTo) {
    conditions.push(`v."createdAt" <= ${bind(params, filters.dateTo)}`);
  }
  if (filters.favoris) {
    conditions.push(`EXISTS (
      SELECT 1 FROM user_favorite_videos f
      WHERE f.video_id = v.id AND f.user_id = ${bind(params, viewer.userId)})`);
  }
  return conditions.join('\n    AND ');
}

// Fields of a result card, for `v` (video_entity) and `creator` (user_entity).
const CARD_COLUMNS = `v.id, v.title, v.miniature_id, coalesce(v.duration, 0) AS duration,
  v.views, v."createdAt", creator.id AS creator_id, creator.username AS creator_username,
  creator."firstName" AS creator_first_name, creator."lastName" AS creator_last_name,
  ARRAY(
    SELECT t.name FROM video_entity_tags_tag_entity vtt
    JOIN tag_entity t ON t.id = vtt."tagEntityId"
    WHERE vtt."videoEntityId" = v.id ORDER BY t.name
  ) AS tags,
  array_remove(ARRAY(
    SELECT coalesce(nullif(trim(u."firstName" || ' ' || u."lastName"), ''), u.username) AS name
    FROM video_entity_internal_speakers_user_entity s
    JOIN user_entity u ON u.id = s."userEntityId"
    WHERE s."videoEntityId" = v.id ORDER BY name
  ) || ARRAY(
    SELECT trim(e.name) FROM unnest(string_to_array(v.external_speakers, ',')) WITH ORDINALITY e(name, i)
    WHERE trim(e.name) <> '' ORDER BY e.i
  ), NULL) AS speakers`;

/**
 * Totals, then the requested page with its cards, from a `ranked` CTE of every
 * matching video (columns `id`, `"createdAt"`, `passage_count` and whatever
 * the order uses). An empty page still returns one row, with the totals.
 */
function pageSql(
  order: string,
  limit: string,
  offset: string,
  hitColumns: string[] = [],
): string {
  const columns = [
    'totals.total',
    'totals.passage_total',
    ...hitColumns,
    CARD_COLUMNS,
  ];
  return `
-- Totals over every matching video, before pagination.
totals AS (
  SELECT count(*)::int AS total, coalesce(sum(passage_count), 0)::int AS passage_total
  FROM ranked
),
-- The requested page, numbered in result order.
page AS (
  SELECT *, row_number() OVER (ORDER BY ${order}) AS ord
  FROM ranked
  ORDER BY ord
  LIMIT ${limit} OFFSET ${offset}
)
SELECT ${columns.join(',\n  ')}
FROM totals
LEFT JOIN page ON true
LEFT JOIN video_entity v ON v.id = page.id
LEFT JOIN user_entity creator ON creator.id = v."creatorId"
ORDER BY page.ord`;
}

/** Design section 6.4: match, level, score, passage counts, then the page. */
function searchSql(
  q: TsQueries,
  where: string,
  order: string,
  limit: string,
  offset: string,
): string {
  return `
WITH
-- Visible videos that pass the filters, with the texts of their document,
-- each gathered once per video. R4: the transcript only counts while it is
-- the one of the current subtitle.
videos AS (
  SELECT v.id, v."createdAt", v.title, v.description,
         coalesce(tags.names, '') AS tags,
         concat_ws(' ', creator."firstName", creator."lastName", creator.username,
                   speakers.names, v.external_speakers) AS people,
         vt.tsv_fr AS transcript, vt.tsv_exact AS transcript_exact
  FROM video_entity v
  LEFT JOIN user_entity creator ON creator.id = v."creatorId"
  LEFT JOIN video_transcript vt ON vt.video_id = v.id AND vt.subtitle_key = v.subtitle_id
  LEFT JOIN LATERAL (
    SELECT string_agg(t.name, ' ' ORDER BY t.name) AS names
    FROM video_entity_tags_tag_entity vtt
    JOIN tag_entity t ON t.id = vtt."tagEntityId"
    WHERE vtt."videoEntityId" = v.id
  ) tags ON true
  LEFT JOIN LATERAL (
    SELECT string_agg(u."firstName" || ' ' || u."lastName", ' '
                      ORDER BY u."lastName", u."firstName", u.id) AS names
    FROM video_entity_internal_speakers_user_entity s
    JOIN user_entity u ON u.id = s."userEntityId"
    WHERE s."videoEntityId" = v.id
  ) speakers ON true
  WHERE ${where}
),
-- One vector per field, and the unstemmed metadata for the exact-form bonus.
fields AS (
  SELECT id, "createdAt", transcript, transcript_exact,
         to_tsvector(${CONFIG}, title) AS title_v,
         to_tsvector(${CONFIG}, tags) AS tags_v,
         to_tsvector(${CONFIG}, people) AS people_v,
         to_tsvector(${CONFIG}, description) AS description_v,
         to_tsvector(${EXACT}, concat_ws(' ', title, tags, people, description)) AS metadata_exact
  FROM videos
),
-- The weighted document of each video: title A, tags and people B,
-- description C, transcript D (already weighted by the indexer).
documents AS (
  SELECT *,
         setweight(title_v, 'A') || setweight(tags_v, 'B') || setweight(people_v, 'B')
           || setweight(description_v, 'C') || coalesce(transcript, ''::tsvector) AS doc
  FROM fields
),
-- Videos with every required group and no excluded term, the fields that
-- match q_any, and the score. R3: nothing when the required groups are only
-- stop words.
matched AS (
  SELECT id, "createdAt", transcript IS NOT NULL AS has_transcript,
         title_v @@ ${q.any} AS in_title,
         tags_v @@ ${q.any} AS in_tags,
         people_v @@ ${q.any} AS in_people,
         description_v @@ ${q.any} AS in_description,
         coalesce(transcript @@ ${q.any}, false) AS in_transcript,
         (ts_rank_cd(${RANK_WEIGHTS}, doc, ${q.any})
           + CASE WHEN metadata_exact @@ ${q.exact}
                    OR coalesce(transcript_exact @@ ${q.exact}, false)
                  THEN ${EXACT_BONUS} ELSE 0 END)::real AS score
  FROM documents
  WHERE numnode(${q.positive}) > 0 AND doc @@ ${q.all}
),
-- Matching segments per video, in a single scan of the GIN index on tsv_fr.
-- Not restricted to matched videos on purpose: the planner cannot estimate
-- how many videos match and would repeat the index scan once per video.
segment_counts AS (
  SELECT s.video_id, count(*)::int AS n
  FROM video_transcript_segment s
  WHERE s.tsv_fr @@ ${q.any}
  GROUP BY s.video_id
),
-- Strict level by field (title, tags or people, description, transcript).
-- R4: segments count only with the transcript of the current subtitle.
ranked AS (
  SELECT m.*, coalesce(sc.n, 0) AS passage_count,
         CASE WHEN in_title THEN 4
              WHEN in_tags OR in_people THEN 3
              WHEN in_description THEN 2
              ELSE 1 END AS level,
         ${MATCHED_IN} AS matched_in
  FROM matched m
  LEFT JOIN segment_counts sc ON sc.video_id = m.id AND m.has_transcript
),${pageSql(order, limit, offset, [
    'page.matched_in',
    'page.score',
    'page.passage_count',
    // Only a matching title is highlighted.
    `CASE WHEN page.in_title
       THEN ts_headline(${CONFIG}, v.title, ${q.any}, ${HIGHLIGHT_OPTIONS})
       ELSE v.title END AS title_marked`,
  ])}`;
}

/** R10: filters only, newest first. */
function browseSql(where: string, limit: string, offset: string): string {
  return `
WITH
-- Visible videos that pass the filters.
ranked AS (
  SELECT v.id, v."createdAt", 0 AS passage_count
  FROM video_entity v
  WHERE ${where}
),${pageSql(ORDER_BY.recent, limit, offset)}`;
}

/** The best matching segments of the given videos, highlighted, in time order. */
function passagesSql(q: TsQueries, videoIds: string): string {
  return `
WITH
-- Matching segments of the videos (R4: current subtitle only), best first.
hits AS (
  SELECT s.video_id, s.position, s.start_s, s.end_s, s.text,
         row_number() OVER (
           PARTITION BY s.video_id
           ORDER BY ts_rank_cd(s.tsv_fr, ${q.positive}) DESC, s.start_s, s.position
         ) AS rank
  FROM video_transcript_segment s
  JOIN video_entity v ON v.id = s.video_id
  JOIN video_transcript vt ON vt.video_id = v.id AND vt.subtitle_key = v.subtitle_id
  WHERE v.id = ANY(${videoIds}::uuid[]) AND s.tsv_fr @@ ${q.any}
)
SELECT video_id, start_s, end_s, rank <= ${BEST_PASSAGES} AS best,
       ts_headline(${CONFIG}, text, ${q.any}, ${HIGHLIGHT_OPTIONS}) AS marked
FROM hits
WHERE rank <= ${MAX_PASSAGES}
ORDER BY video_id, start_s, position`;
}

/** The segments of a video in order, those matching `any` with their highlight. */
export function segmentsSql(any: string | null): string {
  // Without a query nothing matches: no highlight to build.
  const marked = any
    ? `CASE WHEN s.tsv_fr @@ ${any}
         THEN ts_headline(${CONFIG}, s.text, ${any}, ${HIGHLIGHT_OPTIONS})
       END`
    : 'NULL::text';
  return `
SELECT s.start_s, s.end_s, s.text, ${marked} AS marked
FROM video_transcript_segment s
WHERE s.video_id = $1
ORDER BY s.position`;
}

interface VideoRow {
  id: string;
  subtitle_id: string | null;
  transcription_status: string;
  /** Source of the indexed transcript; null when it is not indexed. */
  source: 'auto' | 'provided' | null;
}

interface SegmentRow {
  start_s: number;
  end_s: number;
  text: string;
  /** `ts_headline` output, null when the segment does not match. */
  marked: string | null;
}

interface PageRow {
  total: number;
  passage_total: number;
  /** Null on the single row of an empty page. */
  id: string | null;
  title: string;
  miniature_id: string;
  duration: number;
  views: number;
  createdAt: Date;
  creator_id: string | null;
  creator_username: string | null;
  creator_first_name: string | null;
  creator_last_name: string | null;
  tags: string[];
  speakers: string[];
  // Query mode only.
  matched_in?: MatchedIn[];
  score?: number;
  passage_count?: number;
  title_marked?: string;
}

interface PassageRow {
  video_id: string;
  start_s: number;
  end_s: number;
  best: boolean;
  marked: string;
}

function toVideo(row: PageRow): SearchVideo {
  return {
    id: row.id,
    title: row.title,
    miniature_id: row.miniature_id,
    duration: row.duration,
    views: row.views,
    createdAt: row.createdAt,
    // The front reads the creator unguarded: always an object, empty if unknown.
    creator: {
      id: row.creator_id ?? '',
      username: row.creator_username ?? '',
      firstName: row.creator_first_name ?? '',
      lastName: row.creator_last_name ?? '',
    },
    speakers: row.speakers,
    tags: row.tags,
  };
}

function toResult(
  query: string,
  rows: PageRow[],
  toHit: (row: PageRow) => SearchHit,
): SearchResult {
  return {
    query,
    total: rows[0].total,
    passageTotal: rows[0].passage_total,
    videos: rows.filter((row) => row.id !== null).map(toHit),
  };
}

@Injectable()
export class PostgresSearchGateway implements SearchGateway {
  constructor(private readonly db: DataSource) {}

  async search(
    q: ParsedQuery,
    filters: SearchFilters,
    page: Page,
    viewer: Viewer,
  ): Promise<SearchResult> {
    const params: unknown[] = [];
    if (q.isEmpty) {
      const sql = browseSql(
        filterSql(filters, viewer, params),
        bind(params, page.limit),
        bind(params, page.offset),
      );
      return this.withTimeout(async (m) =>
        toResult('', await m.query(sql, params), (row) => ({
          video: toVideo(row),
          titleParts: [{ text: row.title, hit: false }],
          matchedIn: [],
          score: 0,
          passageCount: 0,
          passages: [],
        })),
      );
    }

    // No required group (only exclusions): nothing to find (R3).
    const ts = buildTsQueries(q, params);
    if (!ts) return { query: q.raw, total: 0, passageTotal: 0, videos: [] };
    const sql = searchSql(
      ts,
      filterSql(filters, viewer, params),
      ORDER_BY[page.sort],
      bind(params, page.limit),
      bind(params, page.offset),
    );
    return this.withTimeout(async (m, spend) => {
      const rows: PageRow[] = await m.query(sql, params);
      const withPassages = rows.filter((row) => row.passage_count > 0);
      const ids = withPassages.map((row) => row.id);
      if (ids.length > 0) await spend();
      const passages = await this.passages(m, q, ids);
      return toResult(q.raw, rows, (row) => ({
        video: toVideo(row),
        titleParts: splitHighlight(row.title_marked),
        matchedIn: row.matched_in,
        score: row.score,
        passageCount: row.passage_count,
        passages: passages.get(row.id) ?? [],
      }));
    });
  }

  async transcript(
    videoId: string,
    q: ParsedQuery | null,
    viewer: Viewer,
  ): Promise<TranscriptResult | null> {
    // Not a UUID: no such video, and no cast error to provoke.
    if (!UUID.test(videoId)) return null;

    const [video]: VideoRow[] = await this.db.query(
      `SELECT v.id, v.subtitle_id, v.transcription_status, vt.source
       FROM video_entity v
       LEFT JOIN video_transcript vt
         ON vt.video_id = v.id AND vt.subtitle_key = v.subtitle_id
       WHERE v.id = $1 AND (NOT v.archived OR $2)`,
      [videoId, viewer.isAdmin],
    );
    if (!video) return null;

    // The id of the database (lower case), not the spelling of the request.
    // R5: ready only while the transcript is the one of the current subtitle (R4).
    const result = (
      status: TranscriptResult['status'],
      source: TranscriptResult['source'],
      segments: TranscriptSegment[] = [],
      matches: number[] = [],
    ): TranscriptResult => ({
      videoId: video.id,
      source,
      status,
      segments,
      matches,
    });

    if (!video.subtitle_id) {
      const running = ['pending', 'processing'].includes(
        video.transcription_status,
      );
      return result(running ? 'pending' : 'none', 'auto');
    }
    if (!video.source) {
      const auto = video.subtitle_id.startsWith('subtitle-auto-');
      return result('pending', auto ? 'auto' : 'provided');
    }

    const params: unknown[] = [videoId];
    // Exclusions apply to whole videos, not to segments (as for passages).
    const ts = q && buildTsQueries({ ...q, excluded: [] }, params);
    const rows: SegmentRow[] = await this.db.query(
      segmentsSql(ts ? ts.any : null),
      params,
    );
    const matches: number[] = [];
    const segments = rows.map((row, index) => {
      if (row.marked !== null) matches.push(index);
      return {
        start: row.start_s,
        end: row.end_s,
        parts:
          row.marked === null
            ? [{ text: row.text, hit: false }]
            : splitHighlight(row.marked),
      };
    });
    return result('ready', video.source, segments, matches);
  }

  /**
   * Runs the statements in one transaction bounded by the search timeout. A
   * timeout rejects with the pg code 57014, left for the use case to map.
   * `work` calls `spend` before each statement after the first, so that all of
   * them share the one budget instead of each getting the full 2 s.
   */
  private withTimeout<T>(
    work: (m: EntityManager, spend: () => Promise<void>) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async (m) => {
      const started = performance.now();
      await m.query(`SET LOCAL statement_timeout = '2s'`);
      const spend = async () => {
        const left = Math.ceil(
          SEARCH_BUDGET_MS - (performance.now() - started),
        );
        await m.query(`SELECT set_config('statement_timeout', $1, true)`, [
          String(Math.max(1, left)),
        ]);
      };
      return work(m, spend);
    });
  }

  private async passages(
    m: EntityManager,
    q: ParsedQuery,
    videoIds: string[],
  ): Promise<Map<string, Passage[]>> {
    const byVideo = new Map<string, Passage[]>();
    if (videoIds.length === 0) return byVideo;
    const params: unknown[] = [videoIds];
    // Exclusions apply to whole videos, not to passages. Leaving them out also
    // keeps every bound parameter referenced, as PostgreSQL requires.
    const ts = buildTsQueries({ ...q, excluded: [] }, params);
    const rows: PassageRow[] = await m.query(passagesSql(ts, '$1'), params);
    for (const row of rows) {
      const list = byVideo.get(row.video_id) ?? [];
      list.push({
        start: row.start_s,
        end: row.end_s,
        best: row.best,
        parts: splitHighlight(row.marked),
      });
      byVideo.set(row.video_id, list);
    }
    return byVideo;
  }
}
