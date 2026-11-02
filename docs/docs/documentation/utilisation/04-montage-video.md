# Montage vidéo

Le créateur d'une vidéo, ou un administrateur, peut la monter : garder certains passages, les réordonner et y ajouter du texte. Le montage est **non destructif** : la vidéo originale n'est jamais modifiée, et on peut toujours y revenir.

:::info État actuel
Cette page décrit le socle : modèle de données et API. Le rendu FFmpeg et l'interface arrivent aux étapes suivantes. D'ici là, l'enregistrement d'un montage (`PUT`) répond `503`. La maquette de l'interface se trouve dans `docs/montage-video/maquette/`.
:::

## Principe

L'interface édite tout le montage localement : couper, supprimer ou déplacer un passage, ajouter un texte. Le bouton « Modifier la vidéo » envoie ensuite l'ensemble en une seule requête. Le backend enregistre le montage puis demande son rendu. Quand le rendu est prêt, les spectateurs voient la version montée.

:::tip Schéma interactif
Copiez le code ci-dessous dans [Mermaid Live Editor](https://mermaid.live) pour visualiser les statuts de rendu :
:::

```mermaid
stateDiagram-v2
    [*] --> draft: POST (montage créé)
    draft --> pending: PUT (enregistrer et rendre)
    failed --> pending: PUT
    ready --> pending: PUT (modifier à nouveau)
    pending --> processing: le worker prend le rendu
    processing --> ready: rendu terminé
    processing --> failed: échec
    pending --> failed: rendu non démarré
    ready --> draft: POST revert
    failed --> draft: POST revert
    draft --> draft: POST revert
```

Tant qu'un rendu est en cours (`pending` ou `processing`), le montage ne peut pas être modifié : toute modification répond `409`.

## Modèle de données

Toutes les durées sont en secondes.

| Table | Contenu |
|-------|---------|
| `video_edit` | Un montage par vidéo (`videoId` unique, supprimé avec la vidéo) : `render_status`, `render_error`, `rendered_media_id`, `version` |
| `video_edit_segment` | Un passage de la vidéo source : `source_start`, `source_end` et `position` dans la vidéo montée |
| `video_edit_text_layer` | Un texte affiché sur un passage, qui suit ce passage quand on le déplace : `content`, `position`, `color`, `start_offset` (depuis le début du passage), `duration` |

### Règles

- La vidéo doit être traitée (`transcoding_status = ready`) et sa durée connue.
- Un montage compte de 1 à 100 passages. Chaque passage dure au moins 1 s et reste dans la durée de la vidéo.
- Un même passage de la source ne peut apparaître qu'une fois : deux passages ne se chevauchent pas dans la source. Des passages bout à bout sont acceptés.
- Un passage porte au plus 10 textes. Chaque texte compte de 1 à 500 caractères et se termine dans son passage. Les textes d'un même passage peuvent se superposer dans le temps.
- Position du texte : `top`, `center` ou `bottom`. Couleur : `white`, `black` ou `green`.

## API

Toutes les routes sont préfixées par `/api`, demandent une authentification Keycloak et sont décrites dans Swagger (`/docs`, tag « Video edits »).

| Méthode | Route | Rôle | Succès |
|---------|-------|------|--------|
| `POST` | `/videos/:videoId/edit` | Crée le montage : un passage couvrant toute la vidéo, sans texte, statut `draft` | `201` |
| `GET` | `/videos/:videoId/edit` | Lit le montage, passages dans l'ordre de lecture | `200` |
| `PUT` | `/videos/:videoId/edit` | Remplace tout le montage et demande son rendu (statut `pending`) | `200` |
| `GET` | `/videos/:videoId/edit/render-status` | Statut de rendu, pour l'écran « Traitement en cours » | `200` |
| `POST` | `/videos/:videoId/edit/revert` | Revient à l'original : les spectateurs le revoient aussitôt, et le montage repart de toute la vidéo, sans texte | `200` |

### Enregistrer un montage

`version` est la version lue avec `GET`. Si quelqu'un a modifié le montage entre-temps, la requête répond `409` : il faut recharger le montage. L'ordre du tableau `segments` est l'ordre de lecture.

```json
PUT /api/videos/ad1b1aa3-d2b3-4041-bfe9-a511bcbe27a2/edit
{
  "version": 1,
  "segments": [
    {
      "sourceStart": 120,
      "sourceEnd": 870,
      "textLayers": [
        { "content": "Ouverture", "position": "bottom", "color": "white", "startOffset": 0, "duration": 300 }
      ]
    },
    { "sourceStart": 1270, "sourceEnd": 2205, "textLayers": [] }
  ]
}
```

La réponse contient le montage enregistré, avec `version` incrémentée et les identifiants des passages et des textes. Ces identifiants changent à chaque enregistrement.

### Erreurs

| Code | Cas |
|------|-----|
| `400` | Identifiant mal formé, corps invalide ou règle non respectée. `message` liste toutes les erreurs, par exemple `segments[1] overlaps segments[0] in the source video` |
| `403` | L'utilisateur n'est ni le créateur de la vidéo ni administrateur |
| `404` | Utilisateur, vidéo (archivée comprise) ou montage introuvable |
| `409` | Montage déjà créé, vidéo pas encore prête, version périmée ou rendu en cours |
| `503` | Rendu indisponible sur cet environnement (rien n'est enregistré) ou rendu non démarré (le montage passe alors en `failed`) |

## Tests

```bash
cd backend
# Règles, cas d'utilisation et endpoints HTTP (sans base de données)
npx jest tests/video-edits

# Migration et gateway sur un PostgreSQL jetable
docker run -d --rm --name video-edit-test -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=video_edit_test -p 25440:5432 postgres:16-alpine
VIDEO_EDIT_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:25440/video_edit_test \
  npx jest --runInBand src/video-edits
docker stop video-edit-test
```

Le test PostgreSQL refuse une base qui contient déjà les tables de l'application : utilisez toujours une base dédiée.
