import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DataSource, EntityManager } from 'typeorm';
import { toWebVtt } from '../../transcription/webvtt';
import { ensureSearchSchema } from '../infra/schema/search-schema';

/**
 * Reference data set of the content search design (annexe A): six French
 * videos with their subtitle cues. One cue table per video drives both the
 * WebVTT file (`fixtureVtt`) and the rows of `video_transcript_segment`, so
 * the two can never disagree.
 *
 * This file is compiled into `dist` (tsconfig.build.json is untouched): it
 * must import nothing that is only available in development (jest,
 * @nestjs/testing).
 */

export type FixtureIds = Record<
  'pgsearch' | 'k8s' | 'rgpd' | 'ffmpeg' | 'sport' | 'logique',
  string
>;
type FixtureKey = keyof FixtureIds;

interface FixtureCue {
  /** Start of the cue in seconds; it lasts until the next cue starts. */
  start: number;
  text: string;
}

interface FixtureVideo {
  title: string;
  description: string;
  tags: string[];
  speaker: { username: string; firstName: string; lastName: string };
  createdDaysAgo: number;
  /** Seconds; the last cue lasts until this instant. */
  duration: number;
  cues: FixtureCue[];
}

const CREATOR = { username: 'demo', firstName: 'Demo', lastName: 'Account' };

const FIXTURE_VIDEOS: Record<FixtureKey, FixtureVideo> = {
  pgsearch: {
    title: 'Rechercher dans ses vidéos avec PostgreSQL',
    description:
      'Retour d’expérience sur la recherche plein texte dans les sous-titres.',
    tags: ['postgresql', 'recherche', 'backend'],
    speaker: {
      username: 'camille.martin',
      firstName: 'Camille',
      lastName: 'Martin',
    },
    createdDaysAgo: 2,
    duration: 1690,
    cues: [
      {
        start: 10,
        text: 'Le sujet du jour : retrouver un passage précis dans des heures de conférence.',
      },
      {
        start: 150,
        text: 'Les sous-titres sont générés par Whisper, puis rangés ligne par ligne en base.',
      },
      {
        start: 390,
        text: 'PostgreSQL sait déjà faire de la recherche plein texte, avec un index de recherche.',
      },
      {
        start: 620,
        text: 'La configuration française ramène les mots à leur racine : conférences devient conférence.',
      },
      {
        start: 860,
        text: 'Les accents sont ignorés, donc école et ecole se retrouvent.',
      },
      {
        start: 1080,
        text: 'Le titre pèse plus lourd que le contenu dans le classement.',
      },
      {
        start: 1320,
        text: 'Limite connue : une faute de frappe ne trouve rien, il faut une suggestion.',
      },
      {
        start: 1550,
        text: 'Prochaine étape : combiner avec une recherche par le sens, si le besoin apparaît.',
      },
    ],
  },
  k8s: {
    title: 'Déployer une plateforme vidéo sur Kubernetes',
    description:
      'Mise en production d’OchoCast : cluster Talos, transcodage FFmpeg et sauvegardes.',
    tags: ['kubernetes', 'devops', 'scaleway'],
    speaker: {
      username: 'camille.martin',
      firstName: 'Camille',
      lastName: 'Martin',
    },
    createdDaysAgo: 5,
    duration: 2712,
    cues: [
      {
        start: 12,
        text: 'Bonjour à tous, merci d’être venus à cette conférence sur la mise en production.',
      },
      {
        start: 95,
        text: 'On a choisi Kubernetes parce qu’on voulait redéployer sans couper le service.',
      },
      {
        start: 260,
        text: 'Le cluster tourne sur Talos, chez Scaleway, avec deux petits nœuds.',
      },
      {
        start: 498,
        text: 'Le transcodage passe par FFmpeg dans des conteneurs lancés à la demande.',
      },
      {
        start: 754,
        text: 'Notre première erreur : des pods sans limite de mémoire qui saturaient le nœud.',
      },
      {
        start: 1012,
        text: 'Kubernetes redémarre le pod, mais la vidéo en cours de traitement est perdue.',
      },
      {
        start: 1290,
        text: 'Les données personnelles des utilisateurs restent dans la base managée, jamais dans le cluster.',
      },
      {
        start: 1544,
        text: 'Pour les sauvegardes, on s’appuie sur celles de l’hébergeur, conservées sept jours.',
      },
      {
        start: 1870,
        text: 'Les sous-titres sont générés la nuit, quand le cluster est peu chargé.',
      },
      {
        start: 2210,
        text: 'Si c’était à refaire, on commencerait avec moins de microservices.',
      },
      {
        start: 2560,
        text: 'Merci, je prends vos questions sur Kubernetes et sur le reste.',
      },
    ],
  },
  rgpd: {
    title: 'RGPD et IA générative : ce qui change en 2026',
    description:
      'Ce que les équipes produit doivent savoir avant d’envoyer des données à un modèle d’IA.',
    tags: ['rgpd', 'ia', 'juridique'],
    speaker: { username: 'ines.haddad', firstName: 'Inès', lastName: 'Haddad' },
    createdDaysAgo: 12,
    duration: 1985,
    cues: [
      {
        start: 8,
        text: 'Aujourd’hui, on parle de RGPD et d’intelligence artificielle générative.',
      },
      {
        start: 140,
        text: 'Première question à se poser : quelles données personnelles partent chez le fournisseur ?',
      },
      {
        start: 380,
        text: 'Une transcription de réunion, c’est souvent plein de noms et d’informations sensibles.',
      },
      {
        start: 615,
        text: 'Le fournisseur doit signer un contrat de sous-traitance, le fameux DPA.',
      },
      {
        start: 880,
        text: 'L’hébergement en Europe ne suffit pas : il faut vérifier qui peut accéder aux données.',
      },
      {
        start: 1104,
        text: 'Conserver les requêtes pour entraîner le modèle, c’est un traitement de plus à déclarer.',
      },
      {
        start: 1390,
        text: 'Pour une école ou une entreprise, l’analyse d’impact devient presque obligatoire.',
      },
      {
        start: 1660,
        text: 'Mon conseil : minimisez, pseudonymisez, et documentez vos choix.',
      },
      {
        start: 1900,
        text: 'Merci, les slides seront partagées avec la vidéo de la conférence.',
      },
    ],
  },
  ffmpeg: {
    title: 'Transcoder ses vidéos avec FFmpeg',
    description:
      'Atelier pratique : formats, qualités HLS et extraction de l’audio.',
    tags: ['ffmpeg', 'vidéo', 'atelier'],
    speaker: {
      username: 'lucas.bernard',
      firstName: 'Lucas',
      lastName: 'Bernard',
    },
    createdDaysAgo: 20,
    duration: 1520,
    cues: [
      {
        start: 5,
        text: 'Dans cet atelier, on va transcoder une vidéo de bout en bout avec FFmpeg.',
      },
      {
        start: 110,
        text: 'Première étape : vérifier les codecs de la source avec ffprobe.',
      },
      {
        start: 300,
        text: 'Ensuite, on produit plusieurs qualités HLS, du 360p au 1080p.',
      },
      {
        start: 560,
        text: 'Chaque qualité est découpée en segments de six secondes.',
      },
      {
        start: 790,
        text: 'Pour la transcription, on extrait l’audio en FLAC, mono, à seize kilohertz.',
      },
      {
        start: 1010,
        text: 'Ce format audio pèse environ soixante mégaoctets par heure.',
      },
      {
        start: 1230,
        text: 'Attention aux vidéos très longues : le transcodage peut dépasser la limite de temps.',
      },
      {
        start: 1450,
        text: 'Des questions ? Les commandes FFmpeg sont dans la description.',
      },
    ],
  },
  sport: {
    title: 'Analyse vidéo du sport : ce que les données racontent',
    description:
      'Comment les clubs exploitent la vidéo et les données de match.',
    tags: ['sport', 'data', 'vidéo'],
    speaker: {
      username: 'hugo.lefevre',
      firstName: 'Hugo',
      lastName: 'Lefèvre',
    },
    createdDaysAgo: 30,
    duration: 2215,
    cues: [
      {
        start: 15,
        text: 'Le football est devenu un sport de données autant que de terrain.',
      },
      {
        start: 240,
        text: 'Chaque match génère des millions de points de données de position.',
      },
      {
        start: 510,
        text: 'La vidéo reste l’outil préféré des entraîneurs pour expliquer une erreur.',
      },
      {
        start: 790,
        text: 'On découpe les actions clés et on les annote, minute par minute.',
      },
      {
        start: 1100,
        text: 'Les données personnelles des joueurs, comme la santé, sont très encadrées.',
      },
      {
        start: 1380,
        text: 'Un club amateur peut commencer avec une simple caméra et un tableur.',
      },
      {
        start: 1720,
        text: 'L’apprentissage automatique aide à repérer les situations qui se répètent.',
      },
      { start: 2100, text: 'Merci à tous d’avoir suivi cette conférence.' },
    ],
  },
  logique: {
    title: 'Logique propositionnelle : les bases',
    description:
      'Cours d’introduction : tables de vérité, implication et équivalence.',
    tags: ['cours', 'mathématiques', 'école'],
    speaker: { username: 'sarah.cohen', firstName: 'Sarah', lastName: 'Cohen' },
    createdDaysAgo: 120,
    duration: 1105,
    cues: [
      {
        start: 6,
        text: 'Bienvenue dans ce premier cours de logique propositionnelle.',
      },
      {
        start: 95,
        text: 'Une proposition est soit vraie, soit fausse : on note 1 ou 0.',
      },
      {
        start: 260,
        text: 'La table de vérité liste toutes les combinaisons possibles.',
      },
      {
        start: 430,
        text: 'L’implication « P implique Q » n’est fausse que si P est vraie et Q fausse.',
      },
      {
        start: 640,
        text: 'Attention, « Q implique P » n’est pas la même chose : c’est la réciproque.',
      },
      {
        start: 820,
        text: 'À l’école, on retient souvent cette règle par cœur, sans la comprendre.',
      },
      {
        start: 1010,
        text: 'Exercice pour la semaine prochaine : construire la table de « P ou Q ».',
      },
    ],
  },
};

const FIXTURE_KEYS = Object.keys(FIXTURE_VIDEOS) as FixtureKey[];

function segmentsOf(key: FixtureKey) {
  const { cues, duration } = FIXTURE_VIDEOS[key];
  return cues.map((cue, position) => ({
    position,
    start: cue.start,
    end: cues[position + 1]?.start ?? duration,
    text: cue.text,
  }));
}

/** The `.vtt` file of a fixture video: each cue lasts until the next one, the last until the video ends. */
export function fixtureVtt(key: FixtureKey): string {
  const vtt = toWebVtt(segmentsOf(key));
  if (!vtt) throw new Error(`Fixture video ${key} has no cue`);
  return vtt;
}

async function insertUser(
  tx: EntityManager,
  user: { username: string; firstName: string; lastName: string },
): Promise<string> {
  const id = randomUUID();
  await tx.query(
    `INSERT INTO user_entity (id, username, "firstName", "lastName", email, role, "createdAt")
     VALUES ($1, $2, $3, $4, $5, 'user', now())`,
    [
      id,
      user.username,
      user.firstName,
      user.lastName,
      `${user.username}@example.test`,
    ],
  );
  return id;
}

/**
 * Inserts the six videos of the design's annexe A (creator `demo`, tags,
 * internal speakers, subtitle cues and the `video_transcript` rows) straight
 * into the database, without going through the indexer. Expects the schema of
 * `ensureSearchSchema` and an empty database (see `openSearchTestDatabase`).
 */
export async function loadSearchFixture(db: DataSource): Promise<FixtureIds> {
  return db.transaction(async (tx) => {
    const creatorId = await insertUser(tx, CREATOR);
    const speakerIds = new Map<string, string>();
    const tagIds = new Map<string, string>();
    const ids = {} as FixtureIds;

    for (const key of FIXTURE_KEYS) {
      const video = FIXTURE_VIDEOS[key];
      const videoId = randomUUID();
      ids[key] = videoId;
      await tx.query(
        `INSERT INTO video_entity (id, media_id, miniature_id, subtitle_id, transcription_status,
           title, description, external_speakers, views, duration, transcoding_status, archived,
           "creatorId", "createdAt", "updatedAt")
         VALUES ($1, 'master.m3u8', 'image.jpg', $2, 'ready', $3, $4, '', 0, $5, 'ready', false,
           $6, now() - $7::int * interval '1 day', now() - $7::int * interval '1 day')`,
        [
          videoId,
          `subtitle-auto-${videoId}.vtt`,
          video.title,
          video.description,
          video.duration,
          creatorId,
          video.createdDaysAgo,
        ],
      );

      let speakerId = speakerIds.get(video.speaker.username);
      if (!speakerId) {
        speakerId = await insertUser(tx, video.speaker);
        speakerIds.set(video.speaker.username, speakerId);
      }
      await tx.query(
        `INSERT INTO video_entity_internal_speakers_user_entity ("videoEntityId", "userEntityId") VALUES ($1, $2)`,
        [videoId, speakerId],
      );

      for (const name of video.tags) {
        let tagId = tagIds.get(name);
        if (!tagId) {
          tagId = randomUUID();
          tagIds.set(name, tagId);
          await tx.query(
            `INSERT INTO tag_entity (id, name, "createdAt", "updatedAt") VALUES ($1, $2, now(), now())`,
            [tagId, name],
          );
        }
        await tx.query(
          `INSERT INTO video_entity_tags_tag_entity ("videoEntityId", "tagEntityId") VALUES ($1, $2)`,
          [videoId, tagId],
        );
      }

      const segments = segmentsOf(key);
      await tx.query(
        `INSERT INTO video_transcript_segment (video_id, position, start_s, end_s, text)
         SELECT $1, position, start_s, end_s, text
         FROM unnest($2::int[], $3::real[], $4::real[], $5::text[]) AS s(position, start_s, end_s, text)`,
        [
          videoId,
          segments.map((s) => s.position),
          segments.map((s) => s.start),
          segments.map((s) => s.end),
          segments.map((s) => s.text),
        ],
      );
      await tx.query(
        `INSERT INTO video_transcript (video_id, subtitle_key, source, language, segment_count, tsv_fr, tsv_exact)
         SELECT v.id, v.subtitle_id, 'auto', 'fr', count(*)::int,
                setweight(to_tsvector('ochocast_fr', string_agg(s.text, ' ' ORDER BY s.position)), 'D'),
                to_tsvector('ochocast_exact', string_agg(s.text, ' ' ORDER BY s.position))
         FROM video_entity v
         JOIN video_transcript_segment s ON s.video_id = v.id
         WHERE v.id = $1
         GROUP BY v.id, v.subtitle_id`,
        [videoId],
      );
    }
    return ids;
  });
}

/**
 * Opens the dedicated test DataSource shared by every `*.postgres.spec.ts`
 * under `src/search`: all entities, then the search schema, on a database
 * rebuilt from scratch (`dropSchema` + `synchronize`).
 *
 * `dropSchema` wipes the whole database, so this throws unless the database
 * name in the URL contains `test`.
 */
export async function openSearchTestDatabase(url: string): Promise<DataSource> {
  const databaseName = decodeURIComponent(new URL(url).pathname.slice(1));
  if (!databaseName.includes('test')) {
    throw new Error(
      `Refusing to wipe database "${databaseName}": its name must contain "test".`,
    );
  }
  const db = new DataSource({
    type: 'postgres',
    url,
    entities: [join(__dirname, '../../**/*.entity.ts')],
    dropSchema: true,
    synchronize: true,
  });
  await db.initialize();
  try {
    await ensureSearchSchema(db);
  } catch (error) {
    await db.destroy();
    throw error;
  }
  return db;
}
