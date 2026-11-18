# Pré-découpage par silences : cadrage avant code

L’approche `silencedetect` est validée. Cette fonctionnalité n’est pas encore implémentée : ce document expose son exécution, son interface d’attente et son stockage avant le code.

## Règles confirmées

- Les points détectés sont des **propositions**. L’utilisateur choisit les coupes à appliquer localement. Aucun passage, aucun silence, aucun média n’est supprimé automatiquement.
- Sans piste audio, l’analyse se termine sans coupe et l’interface indique « Cette vidéo n’a pas de piste audio : aucune coupe proposée ». Ce n’est pas un échec technique.
- Le seuil de bruit et la durée minimale du silence sont réglables par configuration serveur.
- Après sélection des propositions, chaque coupe laisse au moins 5 secondes de chaque côté dans son passage actuel, y compris entre deux coupes acceptées. Maximum 100 passages. Les règles de découpe des textes restent celles de l’éditeur.
- Les tests de pertinence doivent porter sur de vrais lives, avec bruit de salle et pauses ; un jeu synthétique ne suffit pas. Des cas synthétiques restent utiles pour les bornes et l’absence d’audio.

## Proposition d’exécution

**Nouveau job d’analyse asynchrone**, exécuté dans la même image FFmpeg avec un déploiement en mode `analyze`, une file et un déclencheur distincts. Le backend authentifie le créateur/admin, enregistre la demande puis publie un petit message signé. Le worker récupère la clé de l’original au claim, utilise FFprobe pour les pistes, puis `silencedetect` pour l’audio. Il n’encode pas de vidéo. Aucun calcul à l’upload : l’analyse est déclenchée à la demande depuis l’éditeur. Aucune occupation de la file des rendus.

Cette proposition nécessite des ressources ops supplémentaires ; elles ne sont pas encore créées. Reprendre les conventions des jobs existants : verrou, idempotence, callbacks signés, limite de tentatives, erreurs permanentes et réconciliation. Ne pas accepter d’URL fournie par le navigateur comme source du worker.

Configuration proposée : `VIDEO_EDIT_SILENCE_NOISE_DB` et `VIDEO_EDIT_SILENCE_MIN_DURATION_SECONDS`. Valeurs initiales proposées **-35 dB et 0,8 s**, à calibrer sur les lives fournis. Les valeurs effectives sont validées et figées dans chaque job. Le point proposé est le milieu du silence ; ni le silence ni les images correspondantes ne sont retirés.

## Ce que voit l’utilisateur pour 45 minutes

Le clic sur « Proposer des coupes » répond rapidement avec un identifiant de job. L’éditeur reste utilisable ; aucun montage ni changement local n’est enregistré ou écrasé.

L’interface affiche successivement « Analyse en attente » puis « Recherche des silences », avec temps écoulé et progression calculée sur la durée audio parcourue lorsque celle-ci est disponible. Sans progression fiable, afficher une attente indéterminée ; ne pas annoncer un temps restant avant mesure sur de vrais lives de 45 minutes.

Le suivi se fait par requêtes espacées sans chevauchement, avec reprise réseau. L’utilisateur peut quitter et rouvrir la page : le job continue et son dernier état est relu. Ce comportement doit être explicite à l’écran. Les limites de durée, taille et temps d’analyse sont à mesurer indépendamment du plafond de **45 minutes de montage rendu** : un original peut être plus long que le montage final.

À la fin : liste des coupes proposées avec temps et sélection individuelle, « Appliquer les coupes sélectionnées » et « Ignorer ». Les points sont revalidés contre les passages locaux courants : ignorer les points dans une zone supprimée et désactiver toute combinaison produisant un passage trop court ou plus de 100 passages. L’application reste locale ; le PUT global et son verrou optimiste conservent leur rôle. Sans silence détecté, afficher « Aucun silence correspondant aux réglages n’a été détecté ».

## Stockage proposé

Une table PostgreSQL dédiée `video_edit_analysis_job` conserve : vidéo, demandeur, type d’analyse, identité de la source (clé, taille et ETag), paramètres effectifs, statut, progression, verrous/tentatives, dates, erreur éventuelle et résultat JSON des temps source proposés. Le résultat distingue notamment `no_audio`, `no_silence` et une liste de coupes. Aucun nouveau fichier vidéo ni brouillon de montage n’est produit.

Le frontend lit le résultat via une route protégée de suivi ; il ne le stocke pas comme montage. Une analyse n’est réutilisable que si l’original et les paramètres correspondent. Proposition de rétention : 24 h pour les résultats, à confirmer avec l’équipe ; suppression en cascade si la vidéo est supprimée.

Contrat API proposé avant implémentation : `POST /api/videos/:videoId/edit/silence-analysis` (202 et identifiant), `GET /api/videos/:videoId/edit/silence-analysis/:jobId` (état/résultat), plus lecture du dernier job de cette vidéo pour la reprise. Ces routes n’exigent pas un montage préexistant et appliquent les droits de `getEditableVideo`.

## Validation restante

Fournir quelques vrais enregistrements de live OchoCast, dont un long/bruyant, puis mesurer pertinence, vitesse et coût. Le fichier local utilisé pour la recette de rendu (`videoTest.mp4`, extrait audiovisuel de 121 s) n’est pas identifié comme un live OchoCast et ne valide pas cette condition.

Mesurer un live de 45 minutes avant de fixer timeout, mémoire/disque et estimation d’attente. Couvrir aussi : aucune piste audio, parole continue, silence en début/fin, coupes proches, plus de 99 points, changements locaux pendant l’analyse, source modifiée, reprise réseau et droits d’accès.

Référence primaire : [FFmpeg silencedetect](https://ffmpeg.org/ffmpeg-filters.html#silencedetect).
