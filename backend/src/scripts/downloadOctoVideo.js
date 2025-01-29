// Ce script fonctionne indépendamment du reste du projet, et dois être lancé avec la commande suivante :
// npm install (pour l'installation préalable des dépendances)
// node downloadOctoVideo.js

// TODO
// - Intégrer les thumbmail d'ubicast dans la base de données
// - Récupérer les thumbmail d'ubicast vers scaleway
// - Faire une recherche sur toutes les vidéos (API search ou excel)
// - Récupérer l'entièreté des vidéos d'ubicast

const axios = require('axios');
const { S3Client } = require('@aws-sdk/client-s3');
const { PassThrough } = require('stream');
const { Client } = require('pg');
const { Upload } = require('@aws-sdk/lib-storage');
const fs = require('fs');
const csv = require('csv-parser');

// API and database configuration
const API_KEY = "la cle API d'ubicast ici"; // utilisateur : epita-octocast
const API_BASE_URL = 'https://octo.ubicast.tv/api/v2/';
const BUCKET_NAME = 'prod-media';
const REGION = 'fr-par';
const S3_ACCESS_KEY = 'la cle API de scaleway ici';
const S3_SECRET_KEY = 'la cle API secrete de scaleway ici';

// Prod databse client configuration
const dbClient = new Client({
  user: 'octocast-db-prod',
  host: '51.159.205.159',
  database: 'rdb',
  password: 'le mot de passe de la db',
  port: 5253,
});

// S3 client configuration for Scaleway
const s3Client = new S3Client({
  endpoint: `https://s3.${REGION}.scw.cloud`,
  region: REGION,
  credentials: {
    accessKeyId: S3_ACCESS_KEY,
    secretAccessKey: S3_SECRET_KEY,
  },
});

// Connects to the database and logs success or failure
async function connectDatabase() {
  try {
    await dbClient.connect();
    console.log('✅ Connexion à la base de données réussie.');
  } catch (err) {
    console.error('❌ Erreur lors de la connexion à la base de données :', err);
    process.exit(1);
  }
}

// Closes the database connection
async function closeDatabase() {
  try {
    await dbClient.end();
    console.log('✅ Connexion à la base de données fermée.');
  } catch (err) {
    console.error(
      '❌ Erreur lors de la fermeture de la base de données :',
      err,
    );
  }
}

// Retrieves all videos using exhaustive search terms
//const searchTerms =
'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!$%&()*+,-./:;<=>?@[\\]^_{|}~'.split(
  '',
); // Define search terms for video retrieval
//const searchTerms = "abc".split("");
const oids = []; // To store video oids from CSV
const uniqueVideos = new Map(); // Store unique videos to prevent duplicates
let totalVideosAddedToDB = 0;
let totalVideosUploaded = 0;
let totalVideosFailed = 0;

async function loadOidsFromCsv(filePath) {
  return new Promise((resolve, reject) => {
    const result = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        if (row.oid) {
          result.push(row.oid);
        }
      })
      .on('end', () => {
        console.log(`✅ Loaded ${result.length} oids from CSV.`);
        resolve(result);
      })
      .on('error', reject);
  });
}

// Fetches all videos by iterating over search terms
async function fetchAllVideosExhaustively() {
  // for (const term of searchTerms) {
  //   console.log(`🔍 Recherche avec le terme : "${term}"`);
  //   const videos = await fetchVideosWithSearch(term);
  //   addUniqueVideos(videos);
  //   console.log(
  //     `🔹 Nombre de vidéos récupérées pour "${term}": ${videos.length}`
  //   );
  // }
  // console.log(`✅ Total unique des vidéos récupérées : ${uniqueVideos.size}`);
  for (const oid of oids) {
    //const videoDetails = await fetch(oid);
    const videoDetails = await fetchVideoDetails(oid);
    if (videoDetails) {
      uniqueVideos.set(oid, videoDetails);
    }
  }
  console.log(`✅ Total unique videos retrieved: ${uniqueVideos.size}`);
}

// Retrieves detailed video information
async function fetchVideoDetails(oid) {
  try {
    const response = await axios.get(`${API_BASE_URL}medias/get/`, {
      headers: { api_key: API_KEY },
      params: {
        oid: oid,
        full: 'yes',
      },
    });
    return response.data.info; // Retourne les informations détaillées de la vidéo
  } catch (error) {
    console.error(
      `❌ Erreur lors de la récupération des détails de la vidéo ${oid} :`,
      error.message,
    );
    return null;
  }
}

// Fetches videos matching a search term with pagination
async function fetchVideosWithSearch(searchTerm) {
  let results = [];
  let offset = 0;
  const limit = 100;
  let hasMore = true;

  while (hasMore) {
    try {
      console.log(
        `🔄 Récupération avec offset ${offset}, recherche "${searchTerm}"`,
      );

      const response = await axios.get(`${API_BASE_URL}search/`, {
        headers: { api_key: API_KEY },
        params: {
          search: searchTerm,
          limit,
          flat: 'yes',
          offset,
        },
      });

      const items = response.data.items || [];
      results = results.concat(items);

      hasMore = items.length === limit;
      offset += limit;
    } catch (error) {
      console.error(
        `❌ Erreur lors de la récupération pour "${searchTerm}" :`,
        error.message,
      );
      hasMore = false;
    }
  }

  console.log(`🔹 ${results.length} vidéos récupérées avec "${searchTerm}"`);
  return results;
}

// Adds videos to a map to ensure uniqueness
function addUniqueVideos(videos) {
  for (const video of videos) {
    if (!uniqueVideos.has(video.oid)) {
      uniqueVideos.set(video.oid, video);
    }
  }
}

// Downloads and uploads video to S3, then saves metadata to the database
async function processVideo(video) {
  const videoTitle =
    video.title.replace(/[^a-zA-Z0-9_\-]/g, '_') || 'video_sans_titre';

  try {
    console.log(
      `📥 Téléchargement de la vidéo : ${videoTitle} (OID : ${video.oid})`,
    );

    const videoResponse = await axios({
      method: 'get',
      url: `${API_BASE_URL}download/`,
      responseType: 'stream',
      headers: { api_key: API_KEY },
      params: {
        oid: video.oid,
        playable: 'yes',
        original: 'no',
        redirect: 'yes',
      },
    }).catch((error) => {
      if (error.response && error.response.status === 404) {
        console.error(
          `❌ La vidéo "${videoTitle}" (OID : ${video.oid}) est introuvable (Erreur 404).`,
        );
      } else {
        console.error(
          `❌ Erreur lors du téléchargement de la vidéo "${videoTitle}" (OID : ${video.oid}) :`,
          error.message,
        );
      }
      return null;
    });

    if (!videoResponse) {
      totalVideosFailed++;
      return;
    }

    console.log(`📤 Upload de la vidéo sur Scaleway : ${videoTitle}`);

    const passThrough = new PassThrough();
    videoResponse.data.pipe(passThrough);

    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: `${videoTitle}.mp4`,
      Body: passThrough,
      ContentType: 'video/mp4',
    };

    const upload = new Upload({
      client: s3Client,
      params: uploadParams,
    });

    upload.on('httpUploadProgress', (progress) => {
      if (progress.loaded && progress.total) {
        const uploadProgress = (progress.loaded / progress.total) * 100;
        console.log(`📤 Upload de la vidéo en cours : ${uploadProgress}%`);
      } else {
        console.log(
          `📤 Upload de la vidéo : Pas de données de progression valides`,
        );
      }
    });

    try {
      await upload.done();
      console.log(
        `✅ Vidéo "${videoTitle}" uploadée avec succès sur Scaleway.`,
      );
      totalVideosUploaded++;
    } catch (error) {
      console.error(
        `❌ Erreur lors de l'upload de la vidéo "${videoTitle}" :`,
        error.message,
      );
      totalVideosFailed++;
    }

    const insertQuery = `
      INSERT INTO video_entity (
        media_id, 
        title, 
        description, 
        external_speakers, 
        views, 
        archived, 
        miniature_id,
        creatorId,
        "createdAt",
        "updatedAt"
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (media_id) DO NOTHING
    `;

    const values = [
      video.oid,
      videoTitle,
      video.description || 'Pas de description',
      video.speaker || '',
      video.views || 0,
      false,
      '0',
      '800afa70-17d2-462d-a5a1-87d58fd4ff51',
      video.add_date || Date.now(),
    ];

    await dbClient.query(insertQuery, values);
    console.log(`✅ Vidéo "${videoTitle}" insérée dans la base de données.`);
    totalVideosAddedToDB++;
  } catch (error) {
    console.error(
      `❌ Erreur lors du traitement de la vidéo "${videoTitle}" :`,
      error.message,
    );
    totalVideosFailed++;
  }
}

// Orchestrates the video migration process
async function migrateVideos() {
  await connectDatabase();

  try {
    oids.push(...(await loadOidsFromCsv('data.csv'))); // Provide the correct CSV file path
    await fetchAllVideosExhaustively();

    if (uniqueVideos.size === 0) {
      console.log('Aucune vidéo à migrer.');
      return;
    }

    for (const video of uniqueVideos.values()) {
      await processVideo(video);
    }

    console.log('✅ Migration terminée !');
    console.log(
      `📊 Nombre total de vidéos ajoutées en base de données : ${totalVideosAddedToDB}`,
    );
    console.log(
      `📊 Nombre total de vidéos uploadées dans le bucket Scaleway : ${totalVideosUploaded}`,
    );
    console.log(
      `📊 Nombre total de vidéos ayant échoué : ${totalVideosFailed}`,
    );
  } catch (error) {
    console.error('❌ Erreur critique lors de la migration :', error);
  } finally {
    await closeDatabase();
  }
}

// Initiates the migration process
migrateVideos().catch((error) => {
  console.error('❌ Erreur critique lors de la migration :', error);
});
