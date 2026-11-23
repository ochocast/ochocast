/**
 * Latency of the content search at three years of volume: 500 videos and
 * 250 000 synthetic subtitle segments, then 100 queries of one to three words
 * through `PostgresSearchGateway.search`. Prints p50, p95 and max.
 *
 *   docker run -d --name ochocast-search-perf --cpus=2 --memory=2g \
 *     -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=perf -p 55433:5432 postgres:15-alpine
 *   SEARCH_PERF_DATABASE_URL=postgresql://postgres:postgres@localhost:55433/perf \
 *     npm run search:perf
 *
 * The database is filled and then left in place: it must be a throwaway one.
 * Refuses a database whose name does not contain "perf" as a word.
 */
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { DataSource } from 'typeorm';
import { parseSearchQuery } from '../src/search/domain/query-parser';
import { PostgresSearchGateway } from '../src/search/infra/postgres-search.gateway';
import { ensureSearchSchema } from '../src/search/infra/schema/search-schema';

const VIDEOS = 500;
const SEGMENTS_PER_VIDEO = 500;
const QUERIES = 100;

// Base vocabulary: common words, technical words, accented ones. Combined with
// numeric suffixes it gives a long-tailed vocabulary like real speech.
const COMMON = (
  'le la les de des du un une et est que qui dans pour sur avec nous vous ils ' +
  'ce cette mais ou donc car ne pas plus très aussi alors comme bien faire ' +
  'être avoir pouvoir vouloir voir dire aller prendre mettre tout tous ' +
  'cours projet équipe donnée système serveur sauvegarde réseau utilisateur ' +
  'application service fichier vidéo version production environnement ' +
  'sécurité personnelle exercice séance technique méthode résultat analyse'
).split(' ');
const TECH = (
  'kubernetes docker ffmpeg rgpd postgresql stockage cluster déploiement ' +
  'transcodage sous-titre qualité performance migration architecture ' +
  'sauvegarde restauration conteneur nœud latence débit cache index requête ' +
  'logique sport football entraînement stratégie données personnelles'
).split(' ');

function openDataSource(url: string): DataSource {
  const name = decodeURIComponent(new URL(url).pathname.slice(1));
  if (!/(^|[_-])perf([_-]|$)/.test(name)) {
    throw new Error(
      `Refusing database "${name}": its name must contain "perf" as a word.`,
    );
  }
  return new DataSource({
    type: 'postgres',
    url,
    entities: [join(__dirname, '../src/**/*.entity.ts')],
    synchronize: true,
  });
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
}

async function fill(db: DataSource): Promise<void> {
  await db.query(
    `INSERT INTO user_entity (id, username, "firstName", "lastName", email, role, "createdAt")
     VALUES ('00000000-0000-4000-8000-000000000001', 'perf', 'Perf', 'User', 'perf@example.test', 'user', now())
     ON CONFLICT DO NOTHING`,
  );
  // Long-tailed vocabulary: the first words (common, technical) are drawn far
  // more often than the "mot123" tail, as in real speech.
  const vocab = [
    ...COMMON,
    ...TECH,
    ...Array.from({ length: 3000 }, (_, i) => `mot${i + 1}`),
  ];
  await db.query(
    `INSERT INTO video_entity (id, media_id, miniature_id, subtitle_id, transcription_status,
       title, description, external_speakers, views, duration, transcoding_status, archived,
       "creatorId", "createdAt", "updatedAt")
     SELECT gen_random_uuid(), 'master.m3u8', 'image.jpg', 'subtitle-' || g || '.vtt', 'ready',
       'Vidéo ' || g || ' ' || ($1::text[])[1 + floor(random() * 90)::int],
       'Description ' || g, '', 0, ${SEGMENTS_PER_VIDEO * 6}, 'ready', false,
       '00000000-0000-4000-8000-000000000001',
       now() - (g % 1000) * interval '1 day', now()
     FROM generate_series(1, ${VIDEOS}) g`,
    [vocab],
  );
  await db.query(
    `INSERT INTO video_transcript_segment (video_id, position, start_s, end_s, text)
     SELECT v.id, p, (p - 1) * 6, p * 6,
       (SELECT string_agg(($1::text[])[1 + floor(power(random(), 2.2) * ${vocab.length})::int], ' ')
        FROM generate_series(1, 8 + (p * 7 + v.rn) % 5) w(i))
     FROM (SELECT id, row_number() OVER () AS rn FROM video_entity) v,
          generate_series(1, ${SEGMENTS_PER_VIDEO}) p`,
    [vocab],
  );
  await db.query(
    `INSERT INTO video_transcript (video_id, subtitle_key, source, language, segment_count, tsv_fr, tsv_exact)
     SELECT v.id, v.subtitle_id, 'auto', 'fr', count(*)::int,
            setweight(to_tsvector('ochocast_fr', string_agg(s.text, ' ' ORDER BY s.position)), 'D'),
            to_tsvector('ochocast_exact', string_agg(s.text, ' ' ORDER BY s.position))
     FROM video_entity v JOIN video_transcript_segment s ON s.video_id = v.id
     GROUP BY v.id, v.subtitle_id`,
  );
  await db.query(`ANALYZE`);
}

function buildQueries(): string[] {
  const pick = (words: string[]) =>
    words[Math.floor(Math.random() * words.length)];
  return Array.from({ length: QUERIES }, (_, i) => {
    const count = (i % 3) + 1;
    return Array.from({ length: count }, () =>
      Math.random() < 0.5
        ? pick(TECH)
        : Math.random() < 0.5
          ? pick(COMMON)
          : `mot${1 + Math.floor(Math.random() * 3000)}`,
    ).join(' ');
  });
}

async function main(): Promise<void> {
  const url = process.env.SEARCH_PERF_DATABASE_URL;
  if (!url) throw new Error('SEARCH_PERF_DATABASE_URL is not set');
  const db = openDataSource(url);
  await db.initialize();
  try {
    await ensureSearchSchema(db);
    const [{ n }] = await db.query(
      `SELECT count(*)::int AS n FROM video_entity`,
    );
    if (n === 0) {
      const t0 = performance.now();
      await fill(db);
      console.log(
        `filled ${VIDEOS} videos / ${VIDEOS * SEGMENTS_PER_VIDEO} segments in ${Math.round((performance.now() - t0) / 1000)} s`,
      );
    }
    const gateway = new PostgresSearchGateway(db);
    const viewer = { userId: 'perf', isAdmin: false };
    const filters = { tags: [], users: [], favoris: false, archived: false };
    const page = { limit: 20, offset: 0, sort: 'relevance' as const };
    const queries = buildQueries();
    await gateway.search(parseSearchQuery('warmup'), filters, page, viewer);

    const times: number[] = [];
    let withHits = 0;
    for (const query of queries) {
      const t = performance.now();
      const result = await gateway.search(
        parseSearchQuery(query),
        filters,
        page,
        viewer,
      );
      times.push(performance.now() - t);
      if (result.videos.length > 0) withHits++;
    }
    times.sort((a, b) => a - b);
    console.log(
      JSON.stringify({
        queries: QUERIES,
        withHits,
        p50_ms: Math.round(percentile(times, 0.5)),
        p95_ms: Math.round(percentile(times, 0.95)),
        max_ms: Math.round(times[times.length - 1]),
      }),
    );
  } finally {
    await db.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
