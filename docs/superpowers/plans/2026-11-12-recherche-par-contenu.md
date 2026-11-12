# Recherche dans le contenu des vidéos — plan d’implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** permettre de chercher par mots-clés dans les informations **et les sous-titres** des vidéos OchoCast, avec les passages horodatés, le lien vers l’instant, le panneau de transcription et la barre des passages, puis le déployer en staging et en production sans intervention humaine.

**Architecture :**
- recherche plein texte native de PostgreSQL 15 sur la base existante (configurations `ochocast_fr` et `ochocast_exact`, tables `video_transcript` et `video_transcript_segment` créées en SQL brut, hors entités TypeORM) ;
- l’indexeur lit le `.vtt` de `subtitle_id` aux trois endroits où il est posé ;
- l’API passe par un port `SearchGateway` (architecture hexagonale) ;
- le front remplace le filtrage dans le navigateur par l’API et ajoute deux composants à la page vidéo.

**Tech Stack :** NestJS 11, TypeORM 0.3, PostgreSQL 15 (`unaccent`), Jest ; React 18 (react-scripts, react-player 2, react-i18next, CSS modules), Testing Library ; Playwright ; GitHub Actions, Argo CD, kubectl.

**Spec :** `docs/superpowers/specs/2026-11-12-recherche-par-contenu-design.md` (lire les sections 2 à 8 avant toute tâche). Maquette et écarts : `docs/superpowers/specs/assets/2026-11-12-recherche-par-contenu/README.md`.

## Global Constraints

- PostgreSQL 15 (prod et staging : 15.19). Tests d’intégration sur `postgres:15-alpine`.
- Aucun nouveau service hébergé ; uniquement des dépendances sous licence OSI. Aucune nouvelle dépendance npm sauf nécessité argumentée dans la PR.
- Nouvelles tables **jamais** déclarées comme entités TypeORM. SQL de schéma idempotent (`IF NOT EXISTS`, blocs `DO`).
- Configurations de recherche : `ochocast_fr` (copie de `french` + `unaccent, french_stem`) et `ochocast_exact` (copie de `simple` + `unaccent, simple`).
- L’e-mail d’un utilisateur n’entre jamais dans un document de recherche.
- Vidéos archivées : invisibles sauf pour `user_entity.role = 'admin'` avec `archived=true` ; un non-admin qui envoie `archived=true` reçoit 403.
- `q` : 0 à 200 caractères, 10 groupes au plus ; `limit` 1 à 50 (défaut 20) ; `offset` ≥ 0 ; `sort` `relevance` (défaut) ou `recent`.
- `SET LOCAL statement_timeout = '2s'` sur la requête de recherche → 503 au-delà.
- Passages : 20 au plus par vidéo, les 3 meilleurs marqués `best`, renvoyés dans l’ordre chronologique.
- Surlignage : `ts_headline(..., 'HighlightAll=true, StartSel=\u0002, StopSel=\u0003')` découpé en `parts: { text, hit }[]` ; le front n’utilise jamais `dangerouslySetInnerHTML`.
- Verrou d’indexation : `pg_advisory_xact_lock(1794470400, hashtext(video_id::text))`.
- Front : chaînes en `fr` et `en` ; zones d’appui ≥ 44 × 44 px sur tactile ; ruptures de mise en page à 600 px et 1024 px ; police ≥ 16 px dans les champs ; debounce 300 ms ; bandeau 4,5 s ; `progressInterval` 500 ms.
- Commits dans un worktree : le hook husky échoue. Appliquer à la main les étapes `lint-staged` du `package.json` racine (front : `eslint --fix` puis `prettier --write` ; back : `prettier --write`), puis `git commit --no-verify`. **Ne jamais utiliser `git stash`** (pile partagée avec d’autres sessions).
- Fin de chaque commit : `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Saisie brute hostile ou bizarre** : `a & b | !c :*`, `'; DROP TABLE x; --`, guillemet non fermé, emoji, `l’école` avec `’`. Attendu : 200 avec ou sans résultats, jamais 500. → Task 6 (`parses tsquery operators as plain words`) et Task 8 (`does not fail on raw operator input`).
2. **`?t=` invalide** : `-5`, `abc`, `1e9`, absent alors que `q` est présent. Attendu : `t` ignoré si non numérique ou négatif, borné à la durée sinon. → Task 14 (`ignores invalid t` et `clamps t to duration`).
3. **Sous-titres atypiques** : cues dans le désordre, chevauchantes, de durée nulle ; transcription de plus de 2 h (plus de 16 383 positions) ; fichier proche de 4 Mo. Attendu : indexé, segments triés par `start`, recherche juste. → Task 2 (`sorts cues by start`) et Task 3 (`indexes a transcript longer than 16383 words`).
4. **Vidéo archivée ou supprimée entre la recherche et le clic**, ou transcription pas encore prête. Attendu : la page vidéo s’affiche comme aujourd’hui (introuvable ou sans panneau), sans erreur JavaScript. → Task 10 (`returns 404 for an archived video to a non-admin`) et Task 15 (`renders nothing when transcript status is none`).
5. **Durée inconnue ou repères extrêmes** : `duration` nulle ou à 0 avant les métadonnées ; passages à 0 s et à la dernière seconde ; dix passages en 5 s. Attendu : pas de division par zéro, pas de chevauchement, repères dans la barre. → Task 16 (`returns no markers when duration is 0`, `clusters close markers`, `keeps edge markers inside the strip`).

---

## Structure des fichiers

```
backend/src/search/
  search.module.ts                         Module Nest, appel du schéma au démarrage en développement
  domain/
    search.types.ts                        ParsedQuery, SearchFilters, Page, Viewer, SearchResult, TranscriptResult
    query-parser.ts                        parseSearchQuery (pur)
    webvtt-parser.ts                       parseWebVtt (pur)
    highlight.ts                           splitHighlight (pur)
    gateways/search.gateway.ts             port SearchGateway
    usecases/search-videos.usecase.ts
    usecases/get-transcript.usecase.ts
  infra/
    schema/search-schema.ts                ensureSearchSchema, dropSearchSchema (SQL idempotent)
    tsquery-builder.ts                     buildTsQueries (pur)
    postgres-search.gateway.ts             adaptateur PostgreSQL
    transcript-indexer.ts                  TranscriptIndexer (indexVideo, reindexAll)
    controllers/search.controller.ts       GET /search, GET /videos/:id/transcript
    controllers/search-query.dto.ts
  reindex.cli.ts                           commande search:reindex (compilée dans dist)
  testing/search-fixture.ts                jeu de l’annexe A pour les tests d’intégration
backend/src/migrations/1794470400000-AddContentSearch.ts
frontend/src/utils/searchApi.ts            searchContent, getTranscript + types
frontend/src/components/search/HighlightedText.tsx
frontend/src/components/search/SearchVideoResult.tsx (+ .module.css)
frontend/src/components/video/TranscriptPanel.tsx (+ .module.css)
frontend/src/components/video/PassageStrip.tsx (+ .module.css)
frontend/src/components/video/clusterMarkers.ts
e2e/assets/search/*.vtt                    6 fichiers de l’annexe A
e2e/tests/content-search.spec.ts
.github/workflows/search.yml               tests d’intégration PostgreSQL 15
docs/CONTENT_SEARCH.md                     exploitation : démo locale, search:reindex, perf
```

## Lots, PR et ordre

| Lot | Tâches | PR | Peut démarrer quand |
|---|---|---|---|
| L1 Schéma | 1 | PR 1 | tout de suite |
| L2 Indexeur | 2 à 5 | PR 2 | PR 1 fusionnée |
| L3 API recherche | 6 à 9 | PR 3 | PR 1 fusionnée |
| L4 API transcription | 10 | PR 3 | Task 6 faite |
| L5 Front résultats | 11 à 13 | PR 4 | contrat 6.5 du design (réponses simulées) |
| L6 Front page vidéo | 14 à 17 | PR 5 | contrat 6.5 du design |
| L7 Démo, e2e, perf | 18 à 19 | PR 6 | PR 2 à 5 fusionnées |
| L8 Déploiement | 20 à 21 | — (opérations) | PR 1 à 6 fusionnées |

Chaque PR : CI verte, relecture par un agent relecteur, fusion par squash (`gh pr merge --squash --delete-branch`). Une PR par lot, branche `feat/content-search-<lot>` depuis `origin/main`.

**Tests d’intégration en local** (Tasks 1, 3, 4, 8, 10) :

```bash
docker run -d --name ochocast-search-test -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=search_test -p 55432:5432 postgres:15-alpine
export SEARCH_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/search_test
cd backend && npx jest --runInBand src/search
```

Chaque fichier `*.postgres.spec.ts` est ignoré sans `SEARCH_TEST_DATABASE_URL` (comme `transcoding-jobs.postgres.spec.ts`). Il crée le schéma de l’application avec `synchronize: true` sur cette base dédiée, puis appelle `ensureSearchSchema`.

---

## L1 — Schéma

### Task 1: Schéma idempotent, migration et démarrage en développement

**Files:**
- Create: `backend/src/search/infra/schema/search-schema.ts`
- Create: `backend/src/migrations/1794470400000-AddContentSearch.ts`
- Create: `backend/src/search/search.module.ts`
- Modify: `backend/src/app.module.ts` (ajouter `SearchModule` aux imports)
- Modify: `backend/package.json` (script `"test:search": "jest --runInBand src/search"`)
- Create: `.github/workflows/search.yml`
- Create: `backend/src/search/testing/search-fixture.ts`
- Test: `backend/src/search/infra/schema/search-schema.postgres.spec.ts`

**Interfaces:**
- Produces: `ensureSearchSchema(db: DataSource | QueryRunner): Promise<void>` ; `dropSearchSchema(db: DataSource | QueryRunner): Promise<void>` ; classe `AddContentSearch1794470400000` ; `SearchModule`.
- Produces aussi, dans `search-fixture.ts`, pour les Tasks 3, 4, 8 et 10 :
  - `loadSearchFixture(db: DataSource): Promise<FixtureIds>` : les 6 vidéos de l’annexe A du design, créateur `demo` (e-mail `demo@example.test`), tags, intervenants, `createdAt` = maintenant − n jours, `transcoding_status = 'ready'`, `subtitle_id = 'subtitle-auto-<id>.vtt'`, segments et `video_transcript` insérés directement ;
  - `FixtureIds = Record<'pgsearch'|'k8s'|'rgpd'|'ffmpeg'|'sport'|'logique', string>` ;
  - `fixtureVtt(key: keyof FixtureIds): string`, le `.vtt` de chaque vidéo : chaque cue va jusqu’à la suivante, la dernière jusqu’à la durée.

- [ ] **Step 1: Write the failing test** — `search-schema.postgres.spec.ts` :

```ts
it('creates the schema twice without error', async () => {
  await ensureSearchSchema(db);
  await ensureSearchSchema(db);
  const [row] = await db.query(`SELECT to_tsvector('ochocast_fr', 'l’école des conférences')::text AS v`);
  expect(row.v).toBe(`'conferent':4 'ecol':2`);
});
it('computes generated tsvectors on segments', async () => {
  const videoId = await insertVideo(db); // helper local : ligne minimale de video_entity
  await db.query(`INSERT INTO video_transcript_segment (video_id, position, start_s, end_s, text) VALUES ($1, 0, 0, 1, 'Kubernetes redémarre le pod')`, [videoId]);
  const [row] = await db.query(`SELECT tsv_fr::text AS fr, tsv_exact::text AS ex FROM video_transcript_segment WHERE video_id = $1`, [videoId]);
  expect(row.fr).toBe(`'kubernet':1 'pod':4 'redemarr':2`);
  expect(row.ex).toContain(`'kubernetes':1`);
});
it('migration down then up leaves a working schema', async () => {
  const runner = db.createQueryRunner();
  await new AddContentSearch1794470400000().down(runner);
  await new AddContentSearch1794470400000().up(runner);
  await runner.release();
  const [t] = await db.query(`SELECT to_regclass('video_transcript')::text AS t`);
  expect(t.t).toBe('video_transcript');
});
```

- [ ] **Step 2: Run** `cd backend && npx jest --runInBand src/search/infra/schema` — Expected : FAIL, `ensureSearchSchema` introuvable.
- [ ] **Step 3: Implement** `ensureSearchSchema` avec exactement le SQL de la section 6.2 du design (sans la table d’échecs), rendu idempotent : `CREATE EXTENSION IF NOT EXISTS unaccent` ; configurations créées dans un bloc `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'ochocast_fr') THEN … END IF; END $$` ; `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`. `dropSearchSchema` supprime les deux tables et les deux configurations, pas l’extension. La migration `up` appelle `ensureSearchSchema(runner)`, et `down` appelle `dropSearchSchema(runner)`.
- [ ] **Step 4: Implement** `SearchModule` (vide pour l’instant, exporte ce que les tâches suivantes ajoutent) avec `onModuleInit` : si `process.env.NODE_ENV === 'development'` (même condition que `synchronize` dans `database.config.ts`), appeler `ensureSearchSchema(this.dataSource)`.
- [ ] **Step 5: Add** `.github/workflows/search.yml` : déclenché sur `pull_request` et `push` vers `main` quand `backend/**` change. Service `postgres:15-alpine` (`POSTGRES_PASSWORD=postgres`, `POSTGRES_DB=search_test`, port 5432, healthcheck `pg_isready`). Étapes : `npm ci` dans `backend`, puis `npm run test:search` avec `SEARCH_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/search_test`. Calquer le reste sur le job PostgreSQL de `.github/workflows/ffmpeg-serverless.yml`.
- [ ] **Step 5 bis: Implement** `search-fixture.ts` (interface ci-dessus), avec un test `loads the six fixture videos` : 6 vidéos, 11 segments pour `k8s`, et `video_transcript.tsv_fr @@ plainto_tsquery('ochocast_fr', 'kubernetes')` vrai pour `k8s`. La fixture insère les lignes `video_transcript` sans passer par l’indexeur (Task 3), qui n’existe pas encore.
- [ ] **Step 6: Run** les tests (commande de la section « Lots ») — Expected : PASS, 4 tests. Puis `npm run test:unit` — Expected : PASS (rien d’autre ne casse).
- [ ] **Step 7: Verify dev bootstrap** — Créer une base vide, démarrer le backend en `NODE_ENV=development` deux fois, puis `psql … -c "\d video_transcript_segment"`. Expected : la table existe ; aucun stack trace au second démarrage.
- [ ] **Step 8: Commit** — `feat(search): add the content search schema`.

## L2 — Indexeur

### Task 2: Analyseur WebVTT

**Files:**
- Create: `backend/src/search/domain/webvtt-parser.ts`
- Test: `backend/src/search/domain/webvtt-parser.spec.ts`

**Interfaces:**
- Produces: `interface TranscriptCue { start: number; end: number; text: string }` ; `parseWebVtt(source: string): TranscriptCue[]` (secondes, triées par `start` puis `end`, sans cue vide).

- [ ] **Step 1: Write the failing tests** :
  - `parses toWebVtt output` : `parseWebVtt(toWebVtt([{start:1,end:2.5,text:'Bonjour & bienvenue'}]))` → `[{start:1,end:2.5,text:'Bonjour & bienvenue'}]`. `toWebVtt` vient de `src/transcription/webvtt`.
  - `parses an SRT converted to VTT` : un cue `00:00:01.000 --> 00:00:02.000` sur deux lignes `Ligne un` / `ligne deux` → `text: 'Ligne un ligne deux'`.
  - `skips NOTE, STYLE, REGION blocks and cue identifiers`.
  - `accepts mm:ss.mmm and ignores cue settings` : `01:02.500 --> 01:04.000 align:start position:10%` → `start: 62.5`.
  - `strips voice, class, italic, bold and inline timestamp tags` : `<v Marie><i>Salut</i> <c.red>toi</c><00:00:03.000></v>` → `'Salut toi'`.
  - `decodes entities` : `&amp; &lt; &gt; &nbsp;` → `& < >` et une espace.
  - `handles CRLF`.
  - `keeps both apostrophes` : `l'école l’école` reste inchangé.
  - `sorts cues by start` : cues 10 s puis 2 s → ordre 2, 10 ; une cue de durée nulle (`5 --> 5`) est gardée.
  - `returns [] for an empty or header-only file`.
- [ ] **Step 2: Run** `cd backend && npx jest src/search/domain/webvtt-parser.spec.ts` — Expected : FAIL.
- [ ] **Step 3: Implement** `parseWebVtt` (lecture par blocs séparés par une ligne vide ; un bloc est une cue s’il contient `-->`).
- [ ] **Step 4: Run** — Expected : PASS, 10 tests.
- [ ] **Step 5: Commit** — `feat(search): parse WebVTT subtitles`.

### Task 3: `TranscriptIndexer.indexVideo`

**Files:**
- Create: `backend/src/search/infra/transcript-indexer.ts`
- Modify: `backend/src/search/search.module.ts` (provider et export `TranscriptIndexer`, import `S3Module`)
- Test: `backend/src/search/infra/transcript-indexer.postgres.spec.ts`

**Interfaces:**
- Consumes: `parseWebVtt` (Task 2), `ensureSearchSchema` et `fixtureVtt` (Task 1).
- Produces: `type IndexOutcome = 'indexed' | 'unchanged' | 'cleared' | 'not_ready' | 'failed'` ; `class TranscriptIndexer { constructor(db: DataSource, @Inject('s3Client') s3: S3Client); indexVideo(videoId: string): Promise<IndexOutcome> }`.

- [ ] **Step 1: Write the failing tests** (S3 simulé : un `send` qui renvoie le corps d’une `Map<clé, texte>`) :
  - `indexes a new subtitle` : vidéo `ready`, `subtitle_id = 'subtitle-auto-<id>.vtt'` → `'indexed'` ; 11 segments pour `k8s` ; `video_transcript.source = 'auto'` ; `segment_count = 11`.
  - `is unchanged when the key is already indexed` → `'unchanged'`, aucune écriture.
  - `clears when subtitle_id is emptied` → `'cleared'`, 0 segment, plus de ligne `video_transcript`.
  - `does nothing while transcoding is pending` → `'not_ready'`.
  - `writes nothing and logs an error for an unreadable file` : objet absent → `'failed'` ; segments précédents intacts ; `Logger.error` appelé avec l’identifiant de la vidéo.
  - `reindexes when the key changes` : nouvelle clé `subtitle-<id>.vtt` → `source = 'provided'`, segments remplacés.
  - `serialises concurrent indexing` : `Promise.all([indexVideo(id), indexVideo(id)])` → exactement 11 segments, un résultat `'indexed'` et un `'unchanged'`.
  - `indexes a transcript longer than 16383 words` : 1 800 cues de 12 mots → `'indexed'`, et `video_transcript.tsv_fr @@ plainto_tsquery('ochocast_fr', <mot de la dernière cue>)` vaut vrai.
  - `refuses a file over 4 MB` → `'failed'`.
- [ ] **Step 2: Run** les tests d’intégration — Expected : FAIL.
- [ ] **Step 3: Implement** `indexVideo` dans une transaction : (1) `pg_advisory_xact_lock(1794470400, hashtext($1::text))` ; (2) relire `subtitle_id`, `transcoding_status`, `archived` ; (3) `subtitle_id` vide → supprimer les lignes et renvoyer `'cleared'` (ou `'unchanged'` s’il n’y avait rien) ; statut différent de `ready` → `'not_ready'` ; clé déjà indexée → `'unchanged'` ; (4) lire l’objet S3 (`STOCK_MEDIA_BUCKET`, refuser plus de 4 × 1024² octets), le parser, supprimer puis insérer les segments par lots, upsert `video_transcript` avec `tsv_fr = setweight(to_tsvector('ochocast_fr', <texte complet>), 'D')` et `tsv_exact = to_tsvector('ochocast_exact', <texte complet>)`. Toute erreur : rollback, `Logger.error`, `'failed'`.
- [ ] **Step 4: Run** — Expected : PASS, 9 tests.
- [ ] **Step 5: Commit** — `feat(search): index subtitles into search tables`.

### Task 4: `reindexAll` et commande `search:reindex`

**Files:**
- Modify: `backend/src/search/infra/transcript-indexer.ts`
- Create: `backend/src/search/reindex.cli.ts`
- Modify: `backend/package.json` (script `"search:reindex": "node --env-file=.env -r ts-node/register -r tsconfig-paths/register src/search/reindex.cli.ts"`)
- Create: `docs/CONTENT_SEARCH.md`
- Test: ajout dans `transcript-indexer.postgres.spec.ts`

**Interfaces:**
- Produces: `reindexAll(): Promise<{ indexed: number; cleared: number; failed: number; unchanged: number }>`. Dans un pod : `node dist/search/reindex.cli.js`, qui sort avec le code 1 si `failed > 0`.

- [ ] **Step 1: Write the failing test** `reindexes every pending video and is idempotent` : 3 vidéos prêtes avec sous-titres non indexés, 1 vidéo indexée dont `subtitle_id` a été vidé, 1 vidéo `pending` → premier appel `{ indexed: 3, cleared: 1, failed: 0, unchanged: 0 }` ; second appel `indexed: 0, cleared: 0`.
- [ ] **Step 2: Run** — Expected : FAIL.
- [ ] **Step 3: Implement** `reindexAll` avec la sélection de la section 6.3 du design (lots de 20, les plus récentes d’abord, chaque vidéo via `indexVideo`) ; `reindex.cli.ts` initialise la `DataSource` de `src/config/typeorm.config` et `createS3Client()`, appelle `reindexAll`, affiche le résumé en une ligne JSON, `destroy()`. Vérifier que `nest build` produit `dist/search/reindex.cli.js`.
- [ ] **Step 4: Write** `docs/CONTENT_SEARCH.md` : quand et comment lancer la commande en local (`npm run search:reindex`) et dans un pod (`kubectl -n <ns> exec deploy/<backend> -- node dist/search/reindex.cli.js`), et ce que signifie la sortie.
- [ ] **Step 5: Run** — Expected : PASS ; `cd backend && npm run build && ls dist/search/reindex.cli.js` existe.
- [ ] **Step 6: Commit** — `feat(search): add the search:reindex command`.

### Task 5: Indexer dès qu’un sous-titre est posé

**Files:**
- Modify: `backend/src/videos/uploads/uploads.service.ts` (après la transaction qui appelle `createNewVideo`, vers les lignes 380 à 440)
- Modify: `backend/src/transcoding-jobs/transcoding-jobs.service.ts` (après les écritures des lignes 199 et 238)
- Modify: `backend/src/transcription/transcription.service.ts` (après l’`UPDATE … RETURNING` quand `attached` est vrai, vers la ligne 180)
- Modify: `backend/src/videos/uploads/uploads.module.ts`, `backend/src/transcoding-jobs/transcoding-jobs.module.ts`, `backend/src/transcription/transcription.module.ts` (importer `SearchModule`)
- Test: `uploads.service.spec.ts` (existant ou nouveau), `backend/src/transcoding-jobs/transcoding-jobs.spec.ts`, `backend/src/transcription/transcription.service.spec.ts` (existant)

**Interfaces:**
- Consumes: `TranscriptIndexer.indexVideo` (Task 3), injecté. Appel : `void this.indexer.indexVideo(videoId).catch((e) => this.logger.error(...))` **après** la validation de la transaction, jamais à l’intérieur.

- [ ] **Step 1: Write the failing tests** — pour chacun des trois services, avec un `indexVideo` simulé :
  - `indexes after an upload whose subtitle is final` (file désactivée, sous-titre fourni) → appelé une fois avec l’identifiant de la vidéo ;
  - `does not index an upload still transcoding` → pas appelé ;
  - `indexes when a transcoding job completes with a subtitle` → appelé ;
  - `indexes after automatic subtitles are attached` → appelé ;
  - `does not index when a manual subtitle won the race` (`attached` faux) → pas appelé ;
  - `an indexing failure does not fail the caller` : `indexVideo` rejette → l’upload, le job ou la transcription réussit quand même.
- [ ] **Step 2: Run** `cd backend && npx jest src/videos/uploads src/transcoding-jobs src/transcription` — Expected : les nouveaux tests échouent.
- [ ] **Step 3: Implement** les trois appels. Si l’injection crée une dépendance circulaire, `forwardRef(() => SearchModule)`.
- [ ] **Step 4: Run** la même commande, puis `npm run test:transcription` — Expected : PASS.
- [ ] **Step 5: Commit** — `feat(search): index subtitles as soon as they are attached`.

## L3 — API de recherche

### Task 6: Analyseur de requête

**Files:**
- Create: `backend/src/search/domain/search.types.ts`
- Create: `backend/src/search/domain/query-parser.ts`
- Test: `backend/src/search/domain/query-parser.spec.ts`

**Interfaces:**
- Produces :
  ```ts
  type QueryGroup = { kind: 'terms'; alternatives: string[] } | { kind: 'phrase'; text: string };
  interface ParsedQuery { raw: string; groups: QueryGroup[]; excluded: string[]; isEmpty: boolean }
  class QueryTooLongError extends Error {}   // > 200 caractères
  class TooManyGroupsError extends Error {}  // > 10 groupes
  function parseSearchQuery(input: string | undefined): ParsedQuery
  ```
  Ce fichier contient aussi `SearchFilters { tags: string[]; users: string[]; dateFrom?: Date; dateTo?: Date; favoris: boolean; archived: boolean }`, `Page { limit: number; offset: number; sort: 'relevance' | 'recent' }` et `Viewer { userId: string; isAdmin: boolean }`. Les types de résultat reprennent la réponse JSON de la section 6.5 du design : `SearchResult`, `SearchHit`, `Passage`, `TextPart`, `TranscriptResult`.

- [ ] **Step 1: Write the failing tests** :

```ts
expect(parseSearchQuery('kubernetes').groups).toEqual([{ kind: 'terms', alternatives: ['kubernetes'] }]);
expect(parseSearchQuery('"données personnelles"').groups).toEqual([{ kind: 'phrase', text: 'données personnelles' }]);
expect(parseSearchQuery('ffmpeg -audio')).toMatchObject({ groups: [{ kind: 'terms', alternatives: ['ffmpeg'] }], excluded: ['audio'] });
expect(parseSearchQuery('ffmpeg or rgpd').groups).toEqual([{ kind: 'terms', alternatives: ['ffmpeg', 'rgpd'] }]);
expect(parseSearchQuery('ffmpeg OR rgpd').groups).toEqual(parseSearchQuery('ffmpeg or rgpd').groups);
expect(parseSearchQuery('porte-monnaie').groups).toEqual([{ kind: 'terms', alternatives: ['porte-monnaie'] }]);
expect(parseSearchQuery('"open').groups).toEqual([{ kind: 'terms', alternatives: ['open'] }]);
expect(parseSearchQuery('-audio')).toMatchObject({ groups: [], isEmpty: false });
expect(parseSearchQuery('')).toMatchObject({ groups: [], isEmpty: true });
expect(parseSearchQuery(undefined).isEmpty).toBe(true);
expect(() => parseSearchQuery('a'.repeat(201))).toThrow(QueryTooLongError);
expect(() => parseSearchQuery('a b c d e f g h i j k')).toThrow(TooManyGroupsError);
// parses tsquery operators as plain words
expect(parseSearchQuery('a & b | !c :*').groups.flatMap(g => g.kind === 'terms' ? g.alternatives : [])).toEqual(['a', 'b', 'c']);
```

- [ ] **Step 2: Run** `cd backend && npx jest src/search/domain/query-parser.spec.ts` — Expected : FAIL.
- [ ] **Step 3: Implement** `parseSearchQuery`. Les caractères `& | ! : * ( ) < >` sont retirés des mots (ils n’ont pas de sens dans notre syntaxe). `isEmpty` est vrai seulement si la saisie est vide après `trim`.
- [ ] **Step 4: Run** — Expected : PASS.
- [ ] **Step 5: Commit** — `feat(search): parse search queries`.

### Task 7: Construction des `tsquery`

**Files:**
- Create: `backend/src/search/infra/tsquery-builder.ts`
- Test: `backend/src/search/infra/tsquery-builder.spec.ts`

**Interfaces:**
- Consumes: `ParsedQuery` (Task 6).
- Produces: `buildTsQueries(q: ParsedQuery, params: unknown[]): { all: string; any: string; positive: string; exact: string } | null`. Les fragments SQL utilisent des paramètres `$n` ajoutés à `params` ; la fonction renvoie `null` si `q.groups` est vide.
  - `all` : groupes requis (`&&`) et `!!` sur chaque terme exclu.
  - `any` : groupes requis en `||`.
  - `positive` : `all` sans les exclusions.
  - `exact` : comme `all`, avec `ochocast_exact`.

- [ ] **Step 1: Write the failing tests** :
  - `never inlines user text` : pour `'x'; DROP TABLE y; --` aucun fragment ne contient `DROP`, et `params` contient la saisie ;
  - `combines groups` : `ffmpeg -audio` → `all` contient `&& !!` et deux paramètres, `any` un seul ;
  - `uses phraseto_tsquery for phrases` ;
  - `uses || between alternatives` ;
  - `returns null without required groups`.
- [ ] **Step 2: Run** — Expected : FAIL. **Step 3: Implement** (mot : `plainto_tsquery('<config>', $n)` ; phrase : `phraseto_tsquery('<config>', $n)` ; la configuration est un littéral fixe, jamais une saisie). **Step 4: Run** — Expected : PASS.
- [ ] **Step 5: Commit** — `feat(search): build tsqueries from parsed queries`.

### Task 8: `PostgresSearchGateway.search`

**Files:**
- Create: `backend/src/search/domain/gateways/search.gateway.ts`
- Create: `backend/src/search/domain/highlight.ts` (+ `highlight.spec.ts`)
- Create: `backend/src/search/infra/postgres-search.gateway.ts`
- Test: `backend/src/search/infra/postgres-search.gateway.postgres.spec.ts`

**Interfaces:**
- Consumes: Tasks 6 et 7, `loadSearchFixture` (Task 1).
- Produces :
  ```ts
  interface SearchGateway {
    search(q: ParsedQuery, filters: SearchFilters, page: Page, viewer: Viewer): Promise<SearchResult>;
    transcript(videoId: string, q: ParsedQuery | null, viewer: Viewer): Promise<TranscriptResult | null>;
  }
  splitHighlight(marked: string): TextPart[]  // découpe sur \u0002 … \u0003
  ```
  Jeton d’injection : `'SearchGateway'`.

- [ ] **Step 1: Write the failing unit tests** de `splitHighlight` : `'a \u0002b\u0003 c'` → `[{text:'a ',hit:false},{text:'b',hit:true},{text:' c',hit:false}]` ; un texte sans marque donne un seul morceau ; `'<b>test</b>'` reste du texte.
- [ ] **Step 2: Write the failing integration tests** (fixture de l’annexe A, utilisateur non admin, `sort=relevance`). Un test par critère de la section 8 du design, avec ses valeurs exactes :
  - `k8s is found by kubernetes in title, tags and transcript` (critère 1 : `matchedIn` ⊇ `['title','tags','transcript']`, passages `[95, 1012, 2560]`) ;
  - `finds the exact phrase données personnelles` (critère 2) ;
  - `stems conférences` (critère 3 : 4 vidéos, la première est `pgsearch`) ;
  - `ignores accents with ecole` (critère 4 : la première est `logique`) ;
  - `excludes with -audio` (critère 5) ;
  - `ranks title matches before description matches for ffmpeg or rgpd` (critère 6 : les deux premières sont `ffmpeg` et `rgpd`, la dernière `k8s`) ;
  - `matches terms across title and transcript` (critère 7) ;
  - `highlights the phrase index de recherche` (critère 8 : un morceau `hit` vaut `index`) ;
  - `kubrnetes finds nothing` (critère 9) ;
  - `never matches the creator e-mail` (critère 10) ;
  - `hides archived videos from users` et `shows them to admins with archived=true` (critère 11) ;
  - `reads titles live` (critère 12 : `UPDATE` du titre puis recherche) ;
  - `finds a video still transcoding by its title` (`transcoding_status = 'pending'`, sans passages) ;
  - `title beats 15 transcript hits` (critère 12 bis, vidéo ajoutée au test) ;
  - `lists favourites without a query` (critère 12 ter : mode filtres seuls) ;
  - `widens the users filter` (critère 19) ;
  - `marks the 3 best passages and returns them in time order` ;
  - `does not fail on raw operator input` (`a & b | !c :*`).
- [ ] **Step 3: Run** — Expected : FAIL.
- [ ] **Step 4: Implement** `search` selon la section 6.4 du design :
  - `doc` calculé en direct (tags via `video_entity_tags_tag_entity`, intervenants via `video_entity_internal_speakers_user_entity`, favoris via `user_favorite_videos` ; **vérifier ces noms avec `\dt` sur une base créée par `synchronize`**) ;
  - niveau et score, puis tri ;
  - pagination et `total` ;
  - `passageTotal`, passages et `titleParts` via `ts_headline` puis `splitHighlight` ;
  - le tout dans une transaction qui commence par `SET LOCAL statement_timeout = '2s'`.
- [ ] **Step 5: Run** — Expected : PASS (tous les tests de la tâche).
- [ ] **Step 6: Commit** — `feat(search): search videos and passages in PostgreSQL`.

### Task 9: Cas d’usage et `GET /api/search`

**Files:**
- Create: `backend/src/search/domain/usecases/search-videos.usecase.ts`
- Create: `backend/src/search/infra/controllers/search-query.dto.ts`
- Create: `backend/src/search/infra/controllers/search.controller.ts`
- Modify: `backend/src/search/search.module.ts` (contrôleur, `'SearchGateway'`, import `UsersModule`)
- Modify: `backend/src/videos/infra/controllers/videos.controller.ts` (commentaire `@deprecated` sur `searchvideo` et `searchvideoadmin`)
- Test: `search-videos.usecase.spec.ts`, `search.controller.spec.ts`

**Interfaces:**
- Consumes: `'SearchGateway'`, `'UserGateway'.getUserByEmail(email)`, `@CurrentUserEmail()`.
- Produces: `SearchVideosUsecase.execute(dto: SearchQueryDto, email: string): Promise<SearchResult>` ; route `GET /search` (le préfixe global `/api` s’applique).

- [ ] **Step 1: Write the failing tests** :
  - `maps a too long query to 400` ;
  - `maps too many groups to 400` ;
  - `rejects archived=true for a non-admin with 403` ;
  - `passes isAdmin true for role admin` ;
  - `maps a statement timeout to 503` (erreur PostgreSQL `57014`) ;
  - le DTO refuse `limit=0`, `limit=51`, `offset=-1`, `sort=foo` et une date invalide ;
  - `tags=a,b` devient `['a','b']`.
- [ ] **Step 2: Run** — Expected : FAIL. **Step 3: Implement**, avec `class-validator` déjà présent et `ValidationPipe({ transform: true })` comme dans `videos.controller.ts`. **Step 4: Run** — Expected : PASS.
- [ ] **Step 5: Verify** — Backend lancé en local avec la fixture : `curl -s -H "Authorization: Bearer $TOKEN" 'http://localhost:3001/api/search?q=kubernetes' | jq '.total'` → `1`.
- [ ] **Step 6: Commit** — `feat(search): expose GET /api/search`.

## L4 — API transcription

### Task 10: `GET /api/videos/:id/transcript`

**Files:**
- Modify: `backend/src/search/infra/postgres-search.gateway.ts` (méthode `transcript`)
- Create: `backend/src/search/domain/usecases/get-transcript.usecase.ts`
- Modify: `backend/src/search/infra/controllers/search.controller.ts`
- Test: ajouts dans `postgres-search.gateway.postgres.spec.ts` et `search.controller.spec.ts`

**Interfaces:**
- Produces: `GetTranscriptUsecase.execute(videoId: string, q: string | undefined, email: string): Promise<TranscriptResult>` ; route `GET /videos/:id/transcript` (contrôleur séparé ; vérifier qu’aucune route existante de `videos.controller.ts` ne la masque).

- [ ] **Step 1: Write the failing tests** :
  - `returns segments with matches for kubernetes` : `k8s`, `q=kubernetes` → `status: 'ready'`, 11 segments, `matches: [1, 5, 10]` ;
  - `returns plain parts without q` ;
  - `is pending while a subtitle is not indexed` ;
  - `is none without subtitle` ;
  - `returns 404 for an archived video to a non-admin` ;
  - `returns 404 for an unknown id`.
- [ ] **Step 2: Run** — Expected : FAIL. **Step 3: Implement.** **Step 4: Run** — Expected : PASS.
- [ ] **Step 5: Commit** — `feat(search): expose a video transcript with highlights`.

## L5 — Front : page de résultats

### Task 11: Client d’API et `HighlightedText`

**Files:**
- Create: `frontend/src/utils/searchApi.ts`
- Create: `frontend/src/components/search/HighlightedText.tsx`
- Test: `frontend/src/components/search/HighlightedText.test.tsx`

**Interfaces:**
- Produces: `searchContent(params: SearchParams): Promise<SearchResult>` ; `getTranscript(videoId: string, q?: string): Promise<TranscriptResult>`. Les deux passent par l’instance `api` de `src/utils/api.js`. Les types reprennent la section 6.5 du design. `<HighlightedText parts={TextPart[]} />` rend chaque morceau `hit` dans un `<mark>`.

- [ ] **Step 1: Write the failing tests** :
  - `renders hits in mark elements` ;
  - `renders markup literally` : un morceau `'<b>test</b>'` affiche le texte `<b>test</b>`, et `container.querySelector('b')` est `null`.
- [ ] **Step 2: Run** `cd frontend && CI=true npm test -- --watchAll=false src/components/search` — Expected : FAIL. **Step 3: Implement.** **Step 4: Run** — Expected : PASS.
- [ ] **Step 5: Commit** — `feat(search): add the search API client and highlighted text`.

### Task 12: `SearchVideoResult`

**Files:**
- Create: `frontend/src/components/search/SearchVideoResult.tsx` + `.module.css`
- Modify: `frontend/src/locales/fr/translation.json`, `frontend/src/locales/en/translation.json`
- Test: `frontend/src/components/search/SearchVideoResult.test.tsx`

**Interfaces:**
- Produces: `<SearchVideoResult hit={SearchHit} query={string} />`.

- [ ] **Step 1: Write the failing tests**, avec le résultat `k8s` du critère 1 et 5 passages dont 3 `best` :
  - `shows the 3 best passages in time order` ;
  - `expands to all passages` : bouton « Voir les 2 autres passages » puis « Afficher moins de passages » ;
  - `links a passage to the video at its start` : `href` égal à `/video/<id>?t=95&q=kubernetes`, avec `t` arrondi à la seconde inférieure ;
  - `links the title to the video start with q` ;
  - `shows found-in badges` : Titre, Tags, Transcription · 3 passages.
- [ ] **Step 2: Run** — Expected : FAIL.
- [ ] **Step 3: Implement**, en reprenant la carte de la maquette et les styles des vignettes existantes. Ajouter les règles de la section 5.5 : une colonne sous 600 px ; pastilles et bouton « voir plus » d’au moins 44 px de haut.
- [ ] **Step 4: Run** — Expected : PASS.
- [ ] **Step 5: Commit** — `feat(search): show video results with passages`.

### Task 13: Brancher `/search` sur l’API

**Files:**
- Modify: `frontend/src/pages/globalSearch/globalSearch.tsx` (+ `.module.css`)
- Modify: `frontend/src/components/ReworkComponents/generic/Header/Header.tsx` (aide sur la syntaxe au focus, section 5.1 du design)
- Modify: les deux fichiers de traduction
- Test: `frontend/src/pages/globalSearch/globalSearch.test.tsx`, `frontend/src/components/ReworkComponents/generic/Header/Header.test.tsx`

**Interfaces:**
- Consumes: `searchContent` (Task 11), `SearchVideoResult` (Task 12). Les paramètres de l’URL `q`, `tags`, `users`, `dateFrom`, `dateTo`, `favoris`, `archived` et `sort` sont transmis tels quels à l’API.

- [ ] **Step 1: Write the failing tests** (`searchContent` et `getPublishedEvents` simulés) :
  - `calls the API with the URL filters` ;
  - `shows the passages counter` (« 3 passages dans les sous-titres ») ;
  - `switches sort to recent` (met à jour `sort=recent` dans l’URL) ;
  - `loads more videos with offset` ;
  - `shows the empty state without suggestion` ;
  - `shows an error with a retry button` ;
  - `lists filtered videos without a query` (`favoris=true`, pas de `q`) ;
  - `keeps filtering events in the browser` ;
  - dans `Header.test.tsx`, `shows the syntax help when the search field is focused and empty` : texte « "expression exacte" · -mot pour exclure · or pour l’un ou l’autre », masqué dès qu’on tape.
- [ ] **Step 2: Run** — Expected : FAIL.
- [ ] **Step 3: Implement** : retirer `getVideos()` / `getFavoriteVideos()` (ligne 284) et le filtrage local des vidéos ; garder les événements tels quels.
- [ ] **Step 4: Run** — Expected : PASS. Puis `CI=true npm test -- --watchAll=false` — Expected : toute la suite front passe.
- [ ] **Step 5: Commit** — `feat(search): search videos through the API on /search`.

## L6 — Front : page vidéo

### Task 14: `?t=`, `?q=` et bandeau

**Files:**
- Modify: `frontend/src/pages/videoMedia/videoMedia.tsx`
- Test: `frontend/src/pages/videoMedia/videoMedia.test.tsx` (existant, à compléter)

**Interfaces:**
- Produces: `parseStartTime(raw: string | null, duration: number | null): number | null`, exportée depuis `videoMedia.tsx` ou un petit module voisin.

- [ ] **Step 1: Write the failing tests** :
  - `seeks to t when the player is ready` (`seekTo(1012, 'seconds')`) ;
  - `ignores invalid t` (`-5`, `abc`) ;
  - `clamps t to duration` (`1e9` avec une durée de 2712 → 2712) ;
  - `shows the banner with q for 4.5 s` (faux minuteurs) ;
  - `shows no banner without q` ;
  - `shows a back link to the results when q is present` (lien vers `/search?q=<q>`).
- [ ] **Step 2: Run** `cd frontend && CI=true npm test -- --watchAll=false src/pages/videoMedia` — Expected : FAIL.
- [ ] **Step 3: Implement** avec `useSearchParams`. L’appel de `seekTo` dans `handlePlayerReady` se fait une seule fois par `videoId`.
- [ ] **Step 4: Run** — Expected : PASS.
- [ ] **Step 5: Commit** — `feat(search): open a video at a passage`.

### Task 15: `TranscriptPanel`

**Files:**
- Create: `frontend/src/components/video/TranscriptPanel.tsx` + `.module.css`
- Modify: les deux fichiers de traduction
- Test: `frontend/src/components/video/TranscriptPanel.test.tsx`

**Interfaces:**
- Consumes: `getTranscript` (Task 11).
- Produces: `<TranscriptPanel videoId={string} initialQuery={string} currentTime={number} transcriptionStatus={string} onSeek={(s: number) => void} onMatchesChange={(passages: StripPassage[]) => void} />`, avec `interface StripPassage { start: number; excerpt: string }` (exportée depuis `PassageStrip.tsx`). `onMatchesChange` alimente `PassageStrip` (Task 16).

- [ ] **Step 1: Write the failing tests** :
  - `marks the active segment with aria-current` (`currentTime=1015` → ligne 16:52) ;
  - `seeks when a segment is clicked` ;
  - `refetches after 300 ms of typing` ;
  - `moves between occurrences and announces 2 / 3` ;
  - `labels the transcript as automatic or provided` (« générée automatiquement » si `source = 'auto'`, « fournie » sinon) ;
  - `renders preparing when status is pending` ;
  - `renders nothing when transcript status is none` ;
  - `does not auto-scroll with prefers-reduced-motion`.
- [ ] **Step 2: Run** — Expected : FAIL. **Step 3: Implement.** **Step 4: Run** — Expected : PASS.
- [ ] **Step 5: Commit** — `feat(search): show a synced transcript panel`.

### Task 16: `PassageStrip`

**Files:**
- Create: `frontend/src/components/video/clusterMarkers.ts`
- Create: `frontend/src/components/video/PassageStrip.tsx` + `.module.css`
- Test: `frontend/src/components/video/clusterMarkers.test.ts`, `PassageStrip.test.tsx`

**Interfaces:**
- Produces :
  ```ts
  interface MarkerCluster { start: number; count: number; leftPct: number }
  function clusterMarkers(starts: number[], duration: number, widthPx: number, minGapPx: number): MarkerCluster[]
  interface StripPassage { start: number; excerpt: string }
  // <PassageStrip duration={number|null} passages={StripPassage[]} currentTime={number} isTouch={boolean} onSeek={(s:number)=>void} />
  ```
  `minGapPx` vaut 44 sur écran tactile (`matchMedia('(pointer: coarse)')`) et 12 sinon. Pour la largeur, utiliser `ResizeObserver`.

- [ ] **Step 1: Write the failing tests** :
  - `returns no markers when duration is 0` (et quand elle est `null`) ;
  - `places markers at start / duration` (1012 sur 2712 → `leftPct` ≈ 37.32) ;
  - `clusters close markers` (dix passages en 5 s sur 375 px tactile → un groupe `count: 10`, `start` = le premier) ;
  - `keeps edge markers inside the strip` (`leftPct` entre 0 et 100 pour 0 s et pour la durée) ;
  - `never overlaps` (pour tout couple de groupes, écart en pixels ≥ `minGapPx`) ;
  - `seeks on click` ;
  - `labels markers for screen readers` (« Aller à 16:52 : … ») ;
  - `highlights the current passage` ;
  - `shows a tooltip on hover only without touch`.
- [ ] **Step 2: Run** — Expected : FAIL.
- [ ] **Step 3: Implement** `clusterMarkers` : parcours glouton des positions triées ; un repère rejoint le groupe courant si son écart en pixels avec le **premier** repère du groupe est inférieur à `minGapPx`. Implémenter ensuite le composant (zone d’appui de 44 × 44 px sur tactile, trait visuel fin).
- [ ] **Step 4: Run** — Expected : PASS.
- [ ] **Step 5: Commit** — `feat(search): add the passage strip under the player`.

### Task 17: Mise en page de la page vidéo

**Files:**
- Modify: `frontend/src/pages/videoMedia/videoMedia.tsx` + `videoMedia.module.css`
- Test: `frontend/src/pages/videoMedia/videoMedia.test.tsx`

**Interfaces:**
- Consumes: Tasks 14 à 16. `ReactPlayer` reçoit `progressInterval={500}` et `onProgress` met à jour `currentTime`.

- [ ] **Step 1: Write the failing tests** :
  - `renders the strip under the player when there are matches` ;
  - `hides the strip without matches` ;
  - `clicking a strip marker activates the panel line` (critère 16 bis).
- [ ] **Step 2: Run** — Expected : FAIL.
- [ ] **Step 3: Implement** la mise en page de la section 5.5 du design : au-delà de 1024 px, le lecteur et la barre à gauche, le panneau à droite ; en dessous, le panneau sous la barre, `max-height: 50vh`, avec son propre défilement. Garder intact le reste de la page (commentaires, suggestions, qualité, reprise du lien expiré).
- [ ] **Step 4: Run** — Expected : PASS. Puis toute la suite front.
- [ ] **Step 5: Commit** — `feat(search): lay out the video page for every screen size`.

## L7 — Démo, e2e et performance

### Task 18: Fichiers de démo et parcours Playwright

**Files:**
- Create: `e2e/assets/search/{pgsearch,k8s,rgpd,ffmpeg,sport,logique}.vtt` (contenu de l’annexe A, cues jusqu’à la suivante, la dernière jusqu’à la durée)
- Create: `e2e/tests/content-search.spec.ts`
- Modify: `docs/CONTENT_SEARCH.md` (procédure de démo locale : déposer `video-short.mp4` avec chaque `.vtt` via l’interface ou ce test, `--grep @demo`)

- [ ] **Step 1: Write** `content-search.spec.ts`, en réutilisant le dépôt de `e2e/tests/subtitles.spec.ts` :
  1. déposer une vidéo avec `k8s.vtt` ;
  2. interroger `/api/search?q=kubernetes` jusqu’à `total ≥ 1`, 60 s au plus (critère 13) ;
  3. chercher « kubernetes » dans l’en-tête ;
  4. vérifier les 3 passages de cette vidéo ;
  5. cliquer sur 16:52 et vérifier que l’URL contient `t=1012&q=kubernetes` ;
  6. vérifier la ligne `aria-current` 16:52 et le compteur « 2 / 3 » ;
  7. vérifier les 3 repères de la barre.

  Ajouter un test `@viewports` qui parcourt les cinq tailles de la section 5.5 et vérifie, pour les pages résultats et vidéo, que `document.documentElement.scrollWidth <= innerWidth` (critère 20).
- [ ] **Step 2: Run** `npm run test:e2e -- e2e/tests/content-search.spec.ts` (stack locale lancée selon `e2e/README.md`) — Expected : PASS.
- [ ] **Step 3: Commit** — `test(search): cover the content search journey end to end`.

### Task 19: Mesure de performance

**Files:**
- Create: `backend/scripts/search-perf.ts` ; script `"search:perf"` dans `backend/package.json`
- Modify: `docs/CONTENT_SEARCH.md`

- [ ] **Step 1: Implement** `search-perf.ts` :
  - créer, sur `SEARCH_PERF_DATABASE_URL`, 500 vidéos et 250 000 segments synthétiques (vocabulaire français varié, par exemple les phrases de l’annexe A recombinées) ;
  - lancer 100 requêtes d’un à trois mots via `PostgresSearchGateway.search` ;
  - afficher p50, p95 et max.
- [ ] **Step 2: Run** sur un conteneur limité :

```bash
docker run -d --name ochocast-search-perf --cpus=2 --memory=2g -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=perf -p 55433:5432 postgres:15-alpine
SEARCH_PERF_DATABASE_URL=postgresql://postgres:postgres@localhost:55433/perf npm run search:perf
```

  Expected : `p95 < 300 ms` (critère 18). Sinon, matérialiser la partie métadonnées de `doc` (section 10 du design) et mesurer à nouveau.
- [ ] **Step 3: Record** les chiffres dans la description de la PR et dans `docs/CONTENT_SEARCH.md`, puis supprimer le conteneur.
- [ ] **Step 4: Commit** — `test(search): measure search latency at three years of volume`.

## L8 — Déploiement (agents)

Aucune action humaine n’est prévue dans ce lot. **Prérequis, une seule fois par l’humain :** autoriser pour les agents les commandes de la section « Permissions » ci-dessous dans les réglages de Claude Code. Sans ces autorisations, le contrôle automatique des permissions les refuse, comme il a refusé un test d’écriture sur staging pendant le cadrage.

**Permissions à accorder** :
- `gh pr merge`, `gh pr checks`, `gh workflow run` et `gh run watch` sur `ochocast/ochocast` et `ochocast/ops-architecture-lab` ;
- `kubectl --kubeconfig ~/.kube/ochocast.yaml -n staging|production get|rollout status|exec deploy/ochocast-<env>-ochocast-webapp-backend -- node dist/search/reindex.cli.js` ;
- `kubectl … -n argocd get applications`.

### Task 20: Staging

- [ ] **Step 1:** Vérifier que les PR 1 à 6 sont fusionnées dans `main` : `gh pr list --repo ochocast/ochocast --state merged --search "content-search"`.
- [ ] **Step 2:** Attendre la PR de promotion staging ouverte par `main.yml` dans `ochocast/ops-architecture-lab` (branche `promote/ochocast-staging-<sha>`) et sa fusion automatique : `gh pr list --repo ochocast/ops-architecture-lab --head promote/ochocast-staging --state all --limit 3`. Si elle reste ouverte avec ses vérifications vertes, la fusionner : `gh pr merge --squash`.
- [ ] **Step 3:** Attendre le déploiement. Utiliser `export KUBECONFIG=~/.kube/ochocast.yaml` pour toutes les commandes `kubectl` ; ne jamais toucher les autres contextes.

```bash
kubectl -n argocd get application ochocast-staging -o jsonpath='{.status.sync.status} {.status.health.status}'   # Synced Healthy
kubectl -n staging rollout status deploy/ochocast-staging-ochocast-webapp-backend --timeout=10m
kubectl -n staging get deploy ochocast-staging-ochocast-webapp-backend -o jsonpath='{.spec.template.spec.containers[0].image}'   # sha du commit fusionné
```

- [ ] **Step 4:** Vérifier la migration : `kubectl -n staging exec deploy/ochocast-staging-ochocast-webapp-backend -- node -e "<script lecture seule>"`. Le script fait `SELECT to_regclass('video_transcript')`, et compte `migrations WHERE name = 'AddContentSearch1794470400000'`. Expected : la table existe et le compte vaut 1.
- [ ] **Step 5:** Reprise : `kubectl -n staging exec deploy/ochocast-staging-ochocast-webapp-backend -- node dist/search/reindex.cli.js`. Expected : une ligne JSON avec `"failed":0`. Si `failed > 0`, lire les journaux (`kubectl logs`), corriger, relancer.
- [ ] **Step 6:** Contrôle fonctionnel en lecture, dans le pod :
  - compter les vidéos `ready` avec `subtitle_id` non vide ;
  - comparer avec le nombre de lignes `video_transcript` ;
  - lancer une recherche par le gateway sur un mot d’un sous-titre existant.

  Expected : les comptes sont égaux et la recherche renvoie au moins une vidéo.
- [ ] **Step 7:** Consigner le résultat (image, comptes, sortie de la reprise) dans un commentaire de la dernière PR fusionnée.

### Task 21: Production

- [ ] **Step 1:** Ne commencer que si la Task 20 est entièrement verte.
- [ ] **Step 2:** Promouvoir : `gh workflow run promote-staging-to-production.yml --repo ochocast/ochocast`, puis `gh run watch`. Attendre la PR `promote/ochocast-production-from-staging-<tag>` dans `ochocast/ops-architecture-lab`. Vérifier que ses images sont celles de staging, attendre ses vérifications vertes, puis `gh pr merge --squash`.
- [ ] **Step 3:** Répéter les Steps 3 à 6 de la Task 20 avec `production`, `ochocast-prod` et `deploy/ochocast-prod-ochocast-webapp-backend`.
- [ ] **Step 4: Retour arrière**, si le backend ne démarre pas ou si la migration échoue :
  - revenir à la PR de promotion précédente (`gh pr revert`, puis fusion) et vérifier le retour à `Healthy` ;
  - les tables ajoutées sont sans effet sur l’ancien code, aucune action sur la base n’est nécessaire.
- [ ] **Step 5:** Consigner le résultat comme en Task 20, Step 7.

---

## Exécution recommandée

| Phase | Tâches |
|---|---|
| 1 | Task 1 |
| 2, en parallèle | Tasks 2 à 5 ; Tasks 6 à 10 ; Tasks 11 à 13 ; Tasks 14 à 17 (front sur réponses simulées) |
| 3 | Tasks 18 et 19 |
| 4 | Tasks 20 et 21 |

Chaque lot est confié à un agent, dans son propre worktree, avec ce plan et le design comme seules entrées.
