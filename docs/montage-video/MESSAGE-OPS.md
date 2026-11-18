# Message à préparer avec l’équipe ops — brouillon non envoyé

Bonjour,

Le montage vidéo dispose d’un backend et d’un worker FFmpeg en mode `render`. Pouvez-vous préparer en préproduction les ressources suivantes dans `ops-architecture-lab` ? Référence détaillée : `ffmpegServer/SERVERLESS.md`, section « À créer dans ops-architecture-lab ».

- File standard dédiée au rendu, DLQ et alerte ; visibilité 3900 s. Le nombre de livraisons avant DLQ reste à confirmer, aligné sur la fusion au départ.
- Credentials de publication backend et de consommation trigger ; préciser si les clés de transcodage sont réutilisées ou dédiées.
- Déploiement séparé de la même image FFmpeg contenant le mode render et la police DejaVu, `FFMPEG_WORKER_MODE=render`, port 8080, probe `GET /health`, disque éphémère `/work/transcoding` (dimensionnement : au moins trois fois la taille de l’original).
- Trigger de cette file vers `POST /` ; concurrence 1, minimum 0, maximum proposé 2 en préproduction à confirmer.
- Timeout HTTP 3300 s, `TRANSCODING_JOB_TIMEOUT_MS=3000000`, bail backend `VIDEO_EDIT_RENDER_LEASE_SECONDS=3600`.
- Logs et alertes : DLQ, jobs failed, âge des messages et saturation disque/RAM.
- Backend : `VIDEO_EDIT_RENDER_QUEUE_URL`, credentials si dédiés, secrets de dispatch/callback cohérents avec le worker et `VIDEO_EDIT_MAX_DURATION_SECONDS=2700` provisoire.

Ordre de déploiement : backend avec les migrations `1793638092000-CreateVideoEdits` et `1793891216000-AddVideoEditRenderJobs`, worker render, puis frontend. Aucune publication de message avant le backend et ses migrations.

Après déploiement, mesurer les deux encodages d’un montage de 45 minutes et confirmer qu’ils tiennent dans le budget du worker avant de confirmer le plafond produit.

Pouvez-vous nous confirmer le maximum de conteneurs, la politique de relivraison et le choix des clés ? Le digest de l’image et les identifiants de ressources seront fournis/confirmés au déploiement ; aucun nom de ressource n’est présumé ici.
