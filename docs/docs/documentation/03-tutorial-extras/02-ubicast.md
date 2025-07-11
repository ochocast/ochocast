# POC - Migration des vidéos Ubicast - Scaleway

Ce script permet de récupérer les vidéos depuis la plateforme Ubicast et de les stocker sur Scaleway en utilisant AWS S3. Il enregistre également les métadonnées des vidéos dans la base de données PostgreSQL du projet.

## Fonctionnalités

- Connexion à l'API Ubicast pour récupérer les vidéos.
- Stockage des vidéos sur Scaleway via AWS S3.
- Enregistrement des métadonnées des vidéos dans la base PostgreSQL du projet.
- La recherche des vidéos peut se faire par deux moyens :
  - Chargement des identifiants de vidéos (`oids`) depuis un fichier CSV.
  - Recherche exhaustive des vidéos en parcourant divers termes de recherche.

---

# Installation et exécution

## Installation des dépendances

Avant d'exécuter le script, installez les dépendances nécessaires avec la commande :

```sh
npm install
```

## Exécution du script

Lancez le script avec la commande suivante :

```sh
node downloadOctoVideo.js
```

## Configuration

Le script utilise plusieurs variables d’environnement pour stocker les informations sensibles :

### Fonctionnalités principales

- Récupération des vidéos (deux méthodes, à voir laquelle est la plus efficiente) :

  - Par requête directe via leurs identifiants (`oids`).
  - Par recherche exhaustive sur l’API de UbiCast (commenté pour l'instant dans le code).

- Téléchargement et upload :

  - Téléchargement des vidéos depuis l’API UbiCast.
  - Upload vers un bucket Scaleway S3.

- Base de données :
  - Connexion à une base PostgreSQL.
  - Insertion des métadonnées des vidéos.

## Améliorations à implémenter (TODO)

- Intégrer les miniatures d’UbiCast dans la base de données.
- Récupérer et stocker les miniatures d’UbiCast sur Scaleway.
- Améliorer la recherche de vidéos (via API Search ou fichier Excel).
- Automatiser la récupération de toutes les vidéos UbiCast.

## Configuration

### 1. **Variables de connexion**

| Variable        | Description                                           |
| --------------- | ----------------------------------------------------- |
| `API_KEY`       | Clé API pour accéder à l’API UbiCast.                 |
| `API_BASE_URL`  | URL de l’API UbiCast.                                 |
| `BUCKET_NAME`   | Nom du bucket Scaleway où les vidéos seront stockées. |
| `REGION`        | Région du service Scaleway.                           |
| `S3_ACCESS_KEY` | Clé d’accès Scaleway S3.                              |
| `S3_SECRET_KEY` | Clé secrète Scaleway S3.                              |

Les valeurs des variables sensibles doivent être configurées dans le fichier .env ou des secrets d’environnement.

### 1. **Base de données PostgreSQL**

| Paramètre  | Valeur              |
| ---------- | ------------------- |
| `user`     | `octocast-db-prod`  |
| `host`     | `51.159.205.159`    |
| `database` | `rdb`               |
| `password` | Mot de passe requis |
| `port`     | `5253`              |

## Fonctionnement détaillé

1. **Connexion et fermeture de la base de données**

   - `connectDatabase()`: Établit la connexion PostgreSQL.
   - `closeDatabase()`: Ferme la connexion PostgreSQL.

2. **Chargement des vidéos**

   - `loadOidsFromCsv(filePath)`: Charge une liste d’identifiants (oids) depuis un fichier CSV extrait d'Ubicast, contenant l'ensemble des informations des vidéos hébergées.
   - `fetchAllVideosExhaustively()`: Récupère toutes les vidéos à partir de leurs `oids`.

3. **Récupération des vidéos**

   - `fetchVideoDetails(oid)`: Récupère les métadonnées complètes d’une vidéo.
   - `fetchVideosWithSearch(searchTerm)`: Effectue une recherche de vidéos par mot-clé.

4. **Traitement des vidéos**

   - `addUniqueVideos(videos)`: Ajoute des vidéos à la liste en s’assurant qu’il n’y a pas de doublons.
   - `processVideo(video)`: Télécharge, uploade et enregistre une vidéo dans la base de données.

5. **Migration complète**

   - `migrateVideos()`: Orchestration de l’ensemble du processus.

## Gestion des erreurs

Le script inclut plusieurs mécanismes de gestion d’erreurs :

- Vérification des connexions à l’API et à la base de données.
- Vérification du statut HTTP des requêtes API.
- Gestion des erreurs d’upload avec un suivi de progression.
- Vérification et gestion des conflits lors de l’insertion en base de données.

## Suivi des performances

À la fin de l’exécution du script, un bilan des opérations est affiché :

- Nombre de vidéos ajoutées en base de données.
- Nombre de vidéos uploadées sur Scaleway.
- Nombre d’échecs de migration.

## Exécution et logs

Le script affiche des logs détaillés pour suivre l’avancement :

- Connexion à la base de données réussie.
- Recherche avec le terme : "A"
- Téléchargement de la vidéo : exemple.mp4
- Upload de la vidéo sur Scaleway : exemple.mp4
- Vidéo "exemple.mp4" uploadée avec succès.
- Vidéo "exemple.mp4" insérée dans la base de données.
- Migration terminée !
- Nombre total de vidéos ajoutées en base de données : 42
- Nombre total de vidéos uploadées dans le bucket Scaleway : 38
- Nombre total de vidéos ayant échoué : 4

# Auteur

- Développeur(s) : Oriane Margelisch
- Dernière mise à jour : 2024-01-29
