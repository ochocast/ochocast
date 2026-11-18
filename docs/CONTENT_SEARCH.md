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

Le résumé est une ligne JSON, la dernière de la sortie standard (dotenv peut
afficher une ligne d'information avant), par exemple :

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
