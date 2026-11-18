# Recette locale du frontend avec le vrai worker — 18 novembre 2026

## Périmètre et environnement

Branche `feat/video-edit-ui`, poussée sans PR ni fusion. Recette sur le build réel du frontend, Chrome, authentification Keycloak réelle, backend Nest, PostgreSQL local, MinIO local, ElasticMQ et images FFmpeg construites depuis cette branche (transcodage + mode `render`). Aucun mock d’API, du worker ou de l’authentification.

Configuration du processus backend : provider `local`, endpoint `http://127.0.0.1:9324`, région `fr-par`, clés factices `local`, files `ochocast-local-ffmpeg` et `ochocast-local-render`, transcription désactivée. Le `.env` existant pointe vers Scaleway : il n’a pas été modifié. **Le provider seul ne suffit pas : endpoint, URL et clés doivent aussi être remplacés dans le processus.** Aucune migration complète lancée sur la base existante ; synchronisation de développement habituelle.

Source : les 40 premières secondes de `/Users/thomasballer/Downloads/videoTest.mp4` (source originale 121,44 s avec audio, non synthétique). Ce fichier n’est pas identifié comme un live OchoCast : il valide la chaîne de rendu, pas la pertinence du futur détecteur de silences sur des lives.

Compte Keycloak temporaire `codex-edit-recipe-1795010938364`, vidéo dédiée `b66a158c-79ad-4fc2-8c44-224160f47810`. Les vidéos préexistantes et les fichiers originaux n’ont pas été modifiés. Les jetons et mots de passe sont conservés uniquement dans un dossier temporaire privé, jamais dans le dépôt.

## Scénarios vérifiés

| Étape | Manipulation et résultat |
| --- | --- |
| Publication | Upload via les routes multipart réelles, avec miniature et sous-titre VTT, puis transcodage réel vers HLS. |
| Édition | Depuis `/video/:id/edit`, ajout du texte « Texte traversant la coupe », début source 8 s, durée 4 s. Coupes à 10 s et 20 s ; trois passages obtenus, puis réordonnés en `[20,fin_original]`, `[0,10]`, `[10,20]` (voir détail ci-dessous). |
| Enregistrement | Le PUT réel contient trois passages commençant à `[20,0,10]`. Les deux morceaux du texte ont respectivement `(startOffset=8,duration=2)` et `(startOffset=0,duration=2)`. Version 2, réponse `pending`. |
| Rendu | Le worker acquiert et traite le job ; le frontend suit le statut jusqu’à `ready` et revient à la page vidéo avec « Modifiée ». Une tentative ; 21,079 s du timestamp du job au résultat. |
| Lecture | HLS réel lisible en 360p, 480p et 720p. `renderedDuration=40.021 s`, FFprobe `40.033333 s`. L’adresse de l’éditeur reste l’original, distincte du rendu. |
| Texte à la coupe | Images extraites du HLS réel à 28,5 s et 30,5 s : même texte visible de part et d’autre de la coupe. |
| Sous-titres | Absents sur la version montée. |
| Retour à l’original | Clic dans le frontend et acceptation de la confirmation. `edited=false`, original HTTP 200, ancienne playlist montée HTTP 404 ; sous-titres à nouveau disponibles. |
| Échec volontaire | Uniquement pour la vidéo de recette : remplacement temporaire de `originalKey` dans son ancien job de transcodage par une clé inexistante. Le PUT crée un rendu avec cette référence ; la référence historique est immédiatement restaurée, sans suppression ni déplacement de fichier. Le vrai worker termine `failed`, `reason=invalid_source`, `permanent=true`, une seule tentative (0,056 s). Le frontend revient à la page vidéo avec le message d’échec. |
| État final | Métadonnées source restaurées, puis retour à l’original après l’échec (HTTP 200). Aucun fichier original supprimé. |

Détail des passages : après les coupes, les intervalles sont `[0,10]`, `[10,20]`, `[20,fin_original]`. Après réordonnancement : `[20,fin_original]`, `[0,10]`, `[10,20]`. La durée source exposée par l’API est 40 s ; les très légers écarts de rendu viennent des images/échantillons encodés.

## Constat UI et correction

Le composant de chargement partagé occupait `100vh` et repoussait le texte du statut sous le premier écran. Ajout d’un mode `compact` utilisé par l’éditeur, en conservant le comportement des autres pages. Après correction : TypeScript, 31 tests frontend ciblés et build de production réussis (plugin ESLint désactivé, limite locale documentée). Un nouveau rendu réel de reprise a confirmé `pending → processing → ready` ; le titre du statut se trouve à environ 458 px du haut de la page en 1440×1100, donc dans le premier écran. Retour à l’original confirmé ensuite (HTTP 200). Le problème ESLint local est détaillé dans `HANDOFF.md` ; aucun résultat ESLint n’est revendiqué.

## Traces et nettoyage

Traces locales et captures : `/tmp/ochocast-live-recipe/` (dont `01-editor-three-segments.png`, `02-render-pending.png`, `03-rendered-video.png`, `04-original-restored.png`, `05-render-failed.png`, `first-text-half.png`, `second-text-half.png`, `06-compact-processing.png`). Ces fichiers peuvent être temporaires ; le présent compte rendu conserve les assertions et mesures.

Les services, la vidéo et le compte de recette sont conservés pour revue. Leur suppression n’est pas exécutée sans confirmation, conformément aux règles du document de reprise. Aucun volume ni conteneur préexistant supprimé, aucun arrêt forcé.
