# Pré-découpage par silences — première version

L’option B est implémentée sur `feat/video-edit-ui` : analyse à la demande dans le mode et la file de rendu existants, avec cache PostgreSQL et déduplication. La comparaison ci-dessous conserve les raisons du choix. L’activation en production reste conditionnée au déploiement coordonné décrit dans `HANDOFF.md`.

## Règles confirmées

- Les points détectés sont des **propositions**. L’utilisateur choisit les coupes à appliquer localement. Aucun passage, aucun silence, aucun média n’est supprimé automatiquement.
- Sans piste audio, l’analyse se termine sans coupe et l’interface indique « Cette vidéo n’a pas de piste audio : aucune coupe proposée ». Ce n’est pas un échec technique.
- Le seuil de bruit et la durée minimale du silence sont réglables par configuration serveur.
- Après sélection des propositions, chaque coupe laisse au moins 5 secondes de chaque côté dans son passage actuel, y compris entre deux coupes acceptées. Maximum 100 passages. Les règles de découpe des textes restent celles de l’éditeur.
- Les tests de pertinence doivent porter sur de vrais lives, avec bruit de salle et pauses ; un jeu synthétique ne suffit pas. Des cas synthétiques restent utiles pour les bornes et l’absence d’audio.

## Comparaison des emplacements de calcul

Comparaison relative à l’infrastructure déjà prévue pour le transcodage et le rendu. Aucun chiffrage en euros n’est annoncé : les durées, téléchargements et volumes d’usage restent à mesurer sur de vrais lives.

| Option | Ressources ops supplémentaires | Coût d’exécution et exploitation | Couverture et délai utilisateur |
| --- | --- | --- | --- |
| A — Pendant l’upload, dans un passage FFmpeg existant | **0 file, 0 conteneur, 0 trigger** ; variables et déploiement du worker existant | Détection audio pour tous les uploads éligibles, même jamais montés. Pas de téléchargement supplémentaire si le fichier est déjà local. Résultat et paramètres à ajouter aux callbacks/checkpoints. La détection ne doit pas faire échouer la publication. | Propositions prêtes après traitement pour les nouveaux uploads. Ne couvre pas le stock, ni une nouvelle configuration sans réanalyse. Ne doit pas dépendre du seul encodage HLS, car certains uploads sont lus depuis leur source. |
| B — Job `silence_analysis` dans la file et le déploiement de rendu existants | **0 file, 0 conteneur, 0 trigger** ; déployer une version du même worker acceptant deux types signés | À la demande : lecture/téléchargement de l’original et décodage audio, aucun réencodage vidéo. Partage des capacités, de la DLQ et des réglages de livraison du rendu. Un job d’analyse consomme temporairement un emplacement de rendu ; un rendu long peut retarder l’analyse. | Couvre les nouvelles vidéos, le stock disposant d’un original et les paramètres modifiés. Attente explicite, puis progression ; aucun délai maximal promis tant que la capacité partagée n’est pas mesurée. |
| C — File et déploiement séparés | **+1 file, +1 DLQ, +1 conteneur/déploiement, +1 trigger**, droits, alertes et réglages propres | Même analyse audio que B, avec capacité maximale et exploitation supplémentaires ; min=0 n’implique pas un coût nul pendant le traitement. Isolation des délais et des incidents. | Utile si les mesures prouvent que le partage de B empêche de respecter un objectif de délai accepté. Aucune nécessité démontrée à ce stade. |

### Faisabilité de A dans le code actuel

`TranscodingService.transcodeVideoHLS` décode la source dans un seul processus FFmpeg pour les trois variantes. On peut brancher une détection audio unique, sans filtrer trois fois le même son ni retirer des échantillons. L’autre point d’insertion pertinent est **l’extraction FLAC déjà existante**, avant l’encodage HLS : elle couvre aussi certains fichiers joués depuis leur source.

La limite actuelle de transcodage vaut **1200 s par défaut** (`TRANSCODING_MAX_DURATION_SECONDS`). Un original de 45 minutes peut donc éviter complètement l’encodage HLS. L’extraction FLAC est optionnelle (`TRANSCODING_EXTRACT_AUDIO`) et dépend aussi du chemin de traitement. Une intégration limitée au passage HLS n’assure donc pas la couverture de ces fichiers ; une intégration au passage d’extraction doit traiter explicitement les cas où celui-ci est désactivé/évité. Ajouter alors une passe audio dédiée est possible, mais ce n’est plus « aucune passe supplémentaire ».

A convient comme pré-calcul pour les futurs uploads. Seul, il ne satisfait pas l’analyse des vidéos déjà présentes ni le recalcul après changement des seuils. Le résultat doit rester indépendant de la réussite de la publication et être rattaché à la source et aux paramètres effectifs.

### Faisabilité de B et recommandation

**Choix validé et implémenté pour la première version : B, sans nouvelle file ni nouveau déploiement.** C n’est pas retenue à ce stade. A pourra ensuite pré-remplir le même stockage pour réduire l’attente des nouveaux uploads, si l’usage justifie le calcul systématique ; B restera le rattrapage du stock et du recalcul.

Ce n’est pas un simple nouvel alias HTTP : le trigger envoie à `POST /` et le mode `render` utilise actuellement `parseRenderEnvelope`/`RenderRunner`, qui exigent un montage et sa version. Le code ajoute un discriminant signé (`render` ou `silence_analysis`), un dispatch à la racine et des contrats de claim/résultat propres à l’analyse. Les messages de rendu existants sans discriminant restent compatibles. Le job d’analyse utilise sa propre table et son propre statut : il ne passe pas le montage en `pending`, ne verrouille pas ses modifications et ne déclenche aucun encodage HLS.

L’analyse réutilise l’image FFmpeg, le client S3, les signatures, le déploiement, la file et le trigger du rendu ; elle conserve des verrous, une idempotence et une réconciliation spécifiques. Aucune URL arbitraire n’est acceptée depuis le navigateur : le worker reçoit la source validée par le backend. FFprobe vérifie les pistes ; sans audio, résultat `no_audio` immédiat après inspection.

Coûts et contraintes à conserver explicitement :

- Aucun conteneur supplémentaire, mais du temps CPU audio, de l’I/O S3 et du disque temporaire à chaque analyse non cachée. Ne pas promettre une accélération ni un coût chiffré avant mesure.
- Concurrence 1 par conteneur et maximum existant inchangés au départ. La file standard partagée ne donne pas de priorité stricte : ni préemption d’un rendu de 45 minutes, ni délai de prise en charge garanti.
- Dédupliquer les demandes de même source/paramètres et borner les analyses actives pour éviter de remplir la file ; le cache PostgreSQL évite les recalculs identiques.
- Les paramètres de visibilité/re-livraison et la DLQ sont partagés. La visibilité prévue de 3900 s protège les rendus longs mais peut retarder la reprise d’une analyse interrompue. Traiter cela dans le contrat de bail/réconciliation et mesurer les redélivrances, sans multiplier les échecs d’acquisition ou promettre une politique indépendante par type de job.
- Mesurer charge mixte, temps en attente et durée de décodage audio sur les vrais lives. Ne réexaminer C que si un objectif de délai convenu ne tient pas avec cette capacité, ou si l’isolation d’exploitation devient nécessaire.

Configuration proposée : `VIDEO_EDIT_SILENCE_NOISE_DB` et `VIDEO_EDIT_SILENCE_MIN_DURATION_SECONDS`. Valeurs initiales proposées **-35 dB et 0,8 s**, à calibrer sur les lives fournis. Les valeurs effectives sont validées et figées dans chaque job. Le point proposé est le milieu du silence ; ni le silence ni les images correspondantes ne sont retirés.

## Ce que voit l’utilisateur pour 45 minutes

Le clic sur « Proposer des coupes » répond rapidement avec un identifiant de job. Si une analyse identique est déjà disponible, les propositions s’affichent directement. Sinon, l’analyse attend dans la file partagée ; un rendu long déjà engagé peut retarder son démarrage. L’éditeur reste utilisable ; aucun montage ni changement local n’est enregistré ou écrasé.

L’interface affiche successivement « Analyse en attente » puis « Recherche des silences », avec temps écoulé et progression calculée sur la durée audio parcourue lorsque celle-ci est disponible. Sans progression fiable, afficher une attente indéterminée ; ne pas annoncer un temps restant avant mesure sur de vrais lives de 45 minutes.

Le suivi se fait par requêtes espacées sans chevauchement, avec reprise réseau. L’utilisateur peut quitter et rouvrir la page : le job continue et son dernier état est relu. Ce comportement doit être explicite à l’écran. Les limites de durée, taille et temps d’analyse sont à mesurer indépendamment du plafond de **45 minutes de montage rendu** : un original peut être plus long que le montage final.

À la fin : liste des coupes proposées avec temps et sélection individuelle, « Appliquer les coupes sélectionnées » et « Ignorer ». Les points sont revalidés contre les passages locaux courants : ignorer les points dans une zone supprimée et désactiver toute combinaison produisant un passage trop court ou plus de 100 passages. L’application reste locale ; le PUT global et son verrou optimiste conservent leur rôle. Sans silence détecté, afficher « Aucun silence correspondant aux réglages n’a été détecté ».

## Stockage proposé

La migration `1795000000000-AddVideoEditAnalysis` crée la table PostgreSQL `video_edit_analysis_job`, qui conserve : vidéo, demandeur, type d’analyse, identité de la source (clé, taille et ETag), paramètres effectifs, statut, progression, verrous/tentatives, dates, erreur éventuelle et résultat JSON des temps source proposés. Le résultat distingue notamment `no_audio`, `no_silence` et une liste de coupes. Aucun nouveau fichier vidéo ni brouillon de montage n’est produit.

Le frontend lit le résultat via une route protégée de suivi ; il ne le stocke pas comme montage. Une analyse n’est réutilisable que si l’original et les paramètres correspondent. Les résultats sont mis en cache 24 h après leur achèvement, puis nettoyés ; suppression en cascade si la vidéo est supprimée. Le cache est invalidé si clé, ETag, taille ou réglages de détection changent.

Contrat API : `POST /api/videos/:videoId/edit/silence-analysis` (202 et identifiant), `GET /api/videos/:videoId/edit/silence-analysis/:jobId` (état/résultat), `GET /api/videos/:videoId/edit/silence-analysis` pour le dernier job et la reprise. Ces routes n’exigent pas un montage préexistant et appliquent les droits de `getEditableVideo`.

## Validation restante

Les vrais lives seront fournis plus tard par l’utilisateur : 2 ou 3 enregistrements avec bruit de salle/pauses, dont un sans piste audio. Ils restent hors du dépôt et ne sont jamais commités. Mesurer ensuite pertinence, vitesse, coût et charge mixte avec les rendus. Le fichier local utilisé pour la recette de rendu (`videoTest.mp4`, extrait audiovisuel de 121 s) n’est pas identifié comme un live OchoCast et ne valide pas cette condition.

Mesurer un live de 45 minutes avant de fixer timeout, mémoire/disque et estimation d’attente. Couvrir aussi : aucune piste audio, parole continue, silence en début/fin, coupes proches, plus de 99 points, changements locaux pendant l’analyse, source modifiée, reprise réseau et droits d’accès.

Référence primaire : [FFmpeg silencedetect](https://ffmpeg.org/ffmpeg-filters.html#silencedetect).

## Configuration et délai maximal

Backend :

```dotenv
# false par défaut ; activer seulement après mise à jour de tous les workers
VIDEO_EDIT_ANALYSIS_ENABLED=false
VIDEO_EDIT_ANALYSIS_TIMEOUT_MS=300000
VIDEO_EDIT_SILENCE_NOISE_DB=-35
VIDEO_EDIT_SILENCE_MIN_DURATION_SECONDS=0.8
```

Worker en mode `render` : `VIDEO_EDIT_ANALYSIS_TIMEOUT_MS=300000`, strictement inférieur à `TRANSCODING_JOB_TIMEOUT_MS`. Le timeout d’analyse accepte de 1 000 à 600 000 ms ; **5 minutes par défaut**, distinct du budget de rendu (50 minutes de calcul par défaut, 55 minutes au plus pour HTTP). Les deux valeurs backend/worker doivent être alignées ; le worker applique le plus petit budget, jamais un budget supérieur au sien.

Ce délai couvre téléchargement, inspection FFprobe et détection audio après le claim ; il ne couvre pas l’attente dans la file partagée. Les callbacks ont leurs propres délais réseau bornés. Le timeout est définitif pour cette demande, afin de ne pas répéter trois fois un calcul trop long. Les erreurs réseau temporaires peuvent être réessayées (trois acquisitions au maximum).

Un verrou de la ligne vidéo et un index unique partiel sur les statuts actifs empêchent deux demandes simultanées de lancer deux analyses, même entre réplicas ou avec des paramètres différents. Les résultats `no_audio` et `no_silence` sont aussi cachés. La demande est stockée avant publication ; une maintenance reprend la publication non confirmée et les baux expirés. Le bail d’analyse vaut son budget +60 s : une reprise n’attend donc pas les 3 900 s de visibilité de la file partagée. Les doublons sont acquittés sans retraitement si le job est terminé.

Les progrès sont limités à un callback en cours, espacés d’au moins 2 s, sans accumulation d’une file de callbacks qui pourrait prolonger le traitement. L’interface suit le job sans requêtes concurrentes et affiche explicitement qu’il peut attendre derrière les rendus ; le montage reste modifiable.

## Vérifications de cette version

- Tests FFmpeg : vidéos générées à la volée dans le répertoire temporaire système, avec un silence, avec audio continu et sans piste audio ; changement de durée minimale, timeout propre à l’analyse, compatibilité des messages et rejet HTTP d’un type inconnu sans bloquer le job suivant.
- PostgreSQL réel : 24 demandes concurrentes, acquisition exclusive, cache et invalidation ETag, expiration du cache, callbacks idempotents, reprise après bail expiré/publication interrompue, droits et validation HTTP. Les tests utilisent un schéma temporaire isolé dans une base explicitement de test ; aucun schéma applicatif existant n’est effacé.
- Frontend : acceptation explicite, absence de modification automatique, règles 5 s/100 passages, textes suivant les coupes, réévaluation après modifications locales, messages `no_audio`/`no_silence`, reprise et attente en file.
- Recette réelle : Keycloak + backend + PostgreSQL de test + MinIO/buckets de test + ElasticMQ + image worker construite de cette branche. Pour chaque média généré, deux POST simultanés ont donné le même job, une seule ligne a été créée et un POST après succès a réutilisé le cache. Résultats : coupe à 6 s, zéro coupe pour audio continu, zéro coupe avec `no_audio` pour vidéo muette. Dans Chrome : sélection appliquée seulement en local, aucun PUT automatique, montage serveur inchangé avant sauvegarde globale. Le panneau tient sur mobile ; la barre de recherche partagée de l’en-tête présente un débordement antérieur, hors de ce changement.

Commandes :

```bash
cd backend
# Base dédiée, jamais la base applicative ; ou VIDEO_EDIT_TEST_DATABASE_URL en CI
VIDEO_EDIT_ANALYSIS_TEST_DATABASE_URL=postgresql://…/ochocast_analysis_test npm run test:unit -- --runInBand src/video-edits/analysis.postgres.spec.ts
npm run test:unit -- --runInBand tests/video-edits
cd ../ffmpegServer
node --test --require ts-node/register tests/analysis.test.ts
cd ../frontend
CI=true npm test -- --watchAll=false --runInBand src/pages/videoEdit
```

Aucune vidéo de test n’est commitée : les fichiers générés et les futurs vrais lives restent hors dépôt. Les résultats sur de vrais lives et la mesure sur 45 minutes restent à effectuer lorsque l’équipe fournira le corpus. A reste une optimisation possible à l’upload ; C n’est réexaminée que si les mesures révèlent un problème de délai.
