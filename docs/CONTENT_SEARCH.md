# Recherche par contenu

## Reprise de l'indexation : `search:reindex`

Le backend indexe les sous-titres d'une vidéo au moment où il pose son
`subtitle_id`. La commande `search:reindex` rattrape ce qui a été manqué : elle
indexe les vidéos prêtes dont le sous-titre n'est pas encore indexé (les plus
récentes d'abord, par lots de 20, une vidéo à la fois) et efface l'index des
vidéos qui n'ont plus de sous-titre. Il n'y a pas de tâche planifiée.

### Quand la lancer

- Une fois après le premier déploiement de L2 sur chaque environnement, pour
  indexer les vidéos qui ont déjà des sous-titres.
- Ensuite, seulement après un incident : échec d'indexation journalisé, panne du
  stockage, arrêt du backend entre la validation de `subtitle_id` et l'indexation.

### Comment

En local, depuis `backend/` (lit `.env`) :

```bash
cd backend && npm run search:reindex
```

Dans un pod (le build contient `dist/search/reindex.cli.js`) :

```bash
kubectl -n <ns> exec deploy/<backend> -- node dist/search/reindex.cli.js
```

### Lecture de la sortie

Le résumé est une ligne JSON, toujours la dernière de la sortie standard.
D'autres lignes peuvent la précéder (bandeau dotenv, journaux SQL en
développement) : lire la dernière ligne, pas la première. Par exemple :

```text
{"indexed":3,"cleared":1,"failed":0,"unchanged":0}
```

- `indexed` : vidéos dont les sous-titres viennent d'être indexés.
- `cleared` : vidéos dont l'index a été supprimé parce qu'elles n'ont plus de
  sous-titre.
- `failed` : vidéos en échec (objet absent, fichier illisible ou sans cue, plus
  de 4 Mo). Rien n'est écrit pour elles et leur ancien index reste en place.
- `unchanged` : vidéos déjà à jour au moment du traitement (par exemple
  indexées entre-temps par le backend).

Les vidéos dont le transcodage n'est pas terminé (`transcoding_status` autre que
`ready`) ne sont pas sélectionnées.

La commande est idempotente : une seconde exécution répond `indexed: 0` et
`cleared: 0`. Le code de sortie est 1 si `failed > 0` ou en cas d'erreur (le
message va sur la sortie d'erreur), 0 sinon.

Chaque échec est journalisé au niveau `error` avec l'identifiant de la vidéo, la
clé du sous-titre et la cause. Après correction, relancer la commande.

Certains échecs sont permanents et attendus tant que le sous-titre lui-même n'est
pas corrigé ou supprimé : objet absent, fichier sans aucune cue lisible, fichier
de plus de 4 Mo, ou vocabulaire trop grand pour la limite de 1 Mo d'un
`tsvector` PostgreSQL. Une telle vidéo reste en attente : chaque exécution de
`search:reindex` la compte dans `failed` et se termine avec le code 1. Lire
l'identifiant, la clé et la cause journalisés, puis corriger ou retirer ce
sous-titre.

## Mesure de performance : `search:perf`

`backend/scripts/search-perf.ts` remplit une base jetable de 500 vidéos et
250 000 segments synthétiques (vocabulaire français à longue traîne), puis lance
100 requêtes de un à trois mots à travers `PostgresSearchGateway.search`
(pertinence, 20 résultats par page). Il affiche p50, p95 et max. Le nom de la base
doit contenir `perf` comme mot : le script refuse toute autre base.

```bash
docker run -d --name ochocast-search-perf --cpus=2 --memory=2g \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=perf -p 55433:5432 postgres:15-alpine
cd backend
SEARCH_PERF_DATABASE_URL=postgresql://postgres:postgres@localhost:55433/perf npm run search:perf
docker rm -f ochocast-search-perf
```

Mesure du 2026-11-23 (PostgreSQL 15 alpine, 2 CPU, 2 Go, index GIN du schéma) :

| Requêtes | Avec résultats | p50 | p95 | max |
|---|---|---|---|---|
| 100 | 98 | 109 ms | 133 ms | 151 ms |

Objectif du design : p95 < 300 ms. Atteint sans matérialiser la partie
métadonnées du document de recherche.
