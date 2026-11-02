# POC observabilité locale

Reproduit en local la stack cible du plan (`docs/observability-plan.md`, phases 1 à 4) pour le backend :

```
backend (hôte, :3001) ──OTLP :4318──► Alloy ──► Mimir   (métriques)  ─┐
  SDK OpenTelemetry                    masque   Loki    (logs)        ├─► Grafana :3002
  + nestjs-pino                        enrichit Tempo   (traces) ─────┘
                                                  │
                         règles Mimir et Loki ──► Alertmanager :9093 ──► alert-sink (« Slack »)
```

Le backend ne connaît que `OTEL_EXPORTER_OTLP_ENDPOINT`. Seul `alloy/config.alloy` sait où vont les données : passer à Cockpit, Grafana Cloud ou un Loki/Mimir auto-hébergé ne change que ses exporters.

## Lancer

```bash
cd dev-tools/observability
docker compose up -d          # dépendances + stack (≈ 1 min au premier démarrage)
./run-backend.sh              # build puis démarre le backend (autre terminal)
./scenario.sh 3               # trafic : uploads, lectures, erreurs volontaires
```

| Outil | URL |
|---|---|
| Grafana, dashboard « Ochocast · Backend » | http://localhost:3002/d/ochocast-backend |
| Alertmanager | http://localhost:9093 |
| Alloy, graphe du pipeline | http://localhost:12345 |
| Notifications reçues | `docker compose logs -f alert-sink` |

Arrêt : `Ctrl-C` sur le backend (vide les tampons de télémétrie), puis `docker compose down` (`-v` pour effacer les données).

Les ports utilisés sont tous liés à `127.0.0.1` : 3002, 3100, 3200, 4317, 4318, 4566, 5433, 5672, 8080, 9009, 9093, 12345.

## Ce qu'il faut regarder

1. **Une requête = une trace + ses logs.** Dans le dashboard, panneau « Événements upload », ouvrir une ligne `upload completed` puis « Voir la trace » : la trace `POST /api/video-uploads/:id/complete` montre les spans du contrôleur, de PostgreSQL et de S3 (`ListParts`, `CompleteMultipartUpload`, `HeadObject`). Depuis la trace, « Logs for this span » revient aux logs.
2. **Métriques métier.** `ochocast_uploads{upload_state}` et `ochocast_uploads_expired_pending`, lues en base à chaque export.
3. **Métriques dérivées des spans.** Tempo calcule `traces_spanmetrics_calls_total` : le span `recording.start` a un taux d'erreur sans code de métrique dédié.
4. **Alertes.** Le scénario provoque des 500 sur `/api/recordings/start` (pas de control-plane en local). En 1 à 2 min : `BackendHighErrorRate` et `RecordingStartFailing` (critiques, receiver `oncall`), `RecordingFailures` (règle Loki, receiver `ops`).
5. **Masquage.** Alloy remplace toute signature S3 (`X-Amz-Signature=…`) et tout `Bearer …` avant stockage. Test :
   ```bash
   curl -s -H 'Content-Type: application/json' localhost:4318/v1/logs -d '{"resourceLogs":[{"resource":{"attributes":[{"key":"service.name","value":{"stringValue":"redaction-test"}}]},"scopeLogs":[{"logRecords":[{"body":{"stringValue":"https://s3/x?X-Amz-Signature=abc"}}]}]}]}'
   ```
   puis chercher `{service_name="redaction-test"}` dans Loki : la ligne contient `X-Amz-Signature=REDACTED`.

## Contenu

| Fichier | Rôle |
|---|---|
| `docker-compose.yml` | PostgreSQL, Keycloak, S3 (LocalStack), RabbitMQ, Alloy, Mimir, Loki, Tempo, Alertmanager, Grafana |
| `alloy/config.alloy` | pipeline OTLP : nettoyage des attributs de process, environnement, masquage, filtre debug en prod, export |
| `mimir/rules/anonymous/ochocast.yaml` | règles d'alerte sur les métriques (backend et SFU) |
| `loki/rules/fake/ochocast.yaml` | règles d'alerte sur les logs |
| `alertmanager/alertmanager.yml` | routage : critique → `oncall`, avertissement → `ops` |
| `grafana/` | sources de données liées entre elles, dashboard versionné |
| `backend.env` | configuration du backend, variables `OTEL_*` standard comprises |
| `scenario.sh` | trafic de démonstration |

Côté backend :

| Fichier | Rôle |
|---|---|
| `src/instrumentation.ts` | démarre le SDK OpenTelemetry si un collecteur est configuré, sinon ne fait rien |
| `src/config/logger.config.ts` | logs JSON pino, une ligne par requête, sans en-têtes, query string ni corps |
| `src/common/telemetry.ts` | `annotate`, `withSpan`, `untraced` pour l'instrumentation métier |
| `src/videos/uploads/uploads.service.ts` | événements `upload.*`, attributs `upload.id`, jauges, span de maintenance |
| `src/recording/domain/usecases/*` | spans `recording.start` / `recording.stop`, événement `recording.failed` |

## Écarts avec la cible

- **MinIO** n'est plus téléchargeable depuis Docker Hub ni quay.io : S3 est émulé par LocalStack (région `eu-west-3`, LocalStack refuse `fr-par`).
- **Alertmanager** autonome : celui intégré à Mimir 2.15 bloquait les notifications (« invalid service state: Terminated »).
- Pas de `k8sattributes` (pas de cluster) ni de NetworkPolicy : à ajouter en phase 1 dans le cluster.
- `NODE_ENV=development` pour que TypeORM crée le schéma : les requêtes SQL s'affichent aussi sur stdout (hors OTLP).
- Les durées `for` des alertes sont raccourcies pour la démo.
