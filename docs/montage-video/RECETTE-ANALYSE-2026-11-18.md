# Validation de l’analyse par silences — 18 novembre 2026

## Périmètre

Option B : **même mode render, même file et même trigger que le rendu**. Aucun changement de dépendances. Aucun média ajouté au dépôt. Les tests FFmpeg fabriquent leurs vidéos dans le répertoire temporaire système et les retirent ensuite. Les vrais lives fournis par l’équipe restent une étape de validation à venir.

## Tests automatisés

- **141 tests backend** : montage/source existants, réglages et empreinte du cache, PostgreSQL réel et HTTP. 24 demandes simultanées sur une vidéo créent/publient un seul job ; une seule acquisition parmi deux workers concurrents. Cache 24 h, invalidation ETag/paramètres, refus de résultats expirés/obsolètes, bornes de coupes, progression monotone, callbacks idempotents, reprise des baux/publications, arrêt après trois acquisitions temporaires, droits créateur/admin et secret de callback.
- **41 tests frontend** : état et validations existantes, propositions appliquées seulement après sélection/acceptation, ignorance sans effet, temps source après réordonnancement, texte traversant la coupe, revalidation 5 s/100 passages, états d’attente, sans audio et sans silence.
- **36 tests worker dans Docker** : analyse FFmpeg réelle sur trois vidéos générées, réglages de seuil et durée minimale, timeout distinct, signatures/types inconnus, slot HTTP libre pour le message suivant, compatibilité des rendus existants et rendu FFmpeg avec texte.
- TypeScript sur les trois projets et build frontend. Le build utilise toujours `DISABLE_ESLINT_PLUGIN=true` : problème ESLint local existant décrit dans `HANDOFF.md`. Le FFmpeg Homebrew du Mac ne propose pas `drawtext` ; le test de rendu avec texte est donc exécuté dans Docker avec FFmpeg/DejaVu, pas déclaré réussi sur le binaire du Mac.

Les tests PostgreSQL s’exécutent dans un schéma temporaire à nom unique d’une base explicitement de test et appliquent la vraie migration d’analyse. Le workflow backend existant les prend en charge via `VIDEO_EDIT_TEST_DATABASE_URL`, sans ajouter de service CI.

## Recette de bout en bout sur médias générés

Services réels : Keycloak, backend Nest avec flag activé uniquement dans le processus de test, PostgreSQL de test, buckets MinIO dédiés, ElasticMQ et image FFmpeg construite de cette branche. Les ressources isolées de recette ne sont pas de nouvelles ressources de production.

| Vidéo générée (12 s) | Résultat du vrai worker | Déduplication et cache |
| --- | --- | --- |
| Audio avec silence de 3 à 9 s | `ready`, `outcome=cuts`, proposition `[6]` | Deux POST simultanés : même id ; une seule ligne ; POST après succès : `reused=cache` |
| Son continu | `ready`, `outcome=no_silence`, `cuts=[]` | Même vérification |
| Vidéo sans piste audio | `ready`, `outcome=no_audio`, `cuts=[]` | Même vérification |

Les petits jobs ont été observés `pending → ready` par le poll de recette ; ils sont trop rapides pour que celui-ci capture forcément `processing`. Les baux et la progression sont testés séparément. Aucune durée de traitement de live de 45 minutes n’est déduite de ces médias.

Chrome, build réel du frontend et vraie session Keycloak : sélection d’une coupe et application locale donnant deux passages, **aucun PUT automatique**, montage serveur toujours à un passage avant sauvegarde globale. Messages « Cette vidéo n’a pas de piste audio : aucune coupe proposée » et « Aucun silence correspondant aux réglages n’a été détecté » vérifiés. Le contenu de l’éditeur tient sur mobile ; la barre de recherche partagée de l’en-tête déborde horizontalement et reste hors du périmètre de cette modification.

## Déploiement et suite

Émission désactivée par défaut. Migration/backend, puis mise à jour de **tous** les workers render, vérification des deux types, puis activation coordonnée avec le frontend : ordre détaillé dans `HANDOFF.md`. Délai d’exécution proposé et implémenté : **300 000 ms (5 minutes)**, configurable, distinct de l’attente dans la file.

À faire sur les vrais lives : qualité des propositions avec bruit et pauses, cas sans audio réel, temps et consommation sur 45 minutes, attente en charge mixte avec les rendus. A reste une optimisation à l’upload ; C n’est reconsidérée que sur preuve d’un problème de délai.

## Nettoyage des fixtures

Après annonce de la liste, seuls les éléments créés pour ces essais ont été retirés : les 3 objets source générés, les 2 buckets de test, la base dédiée `ochocast_analysis_test_20261118`, le compte Keycloak temporaire et le dossier local temporaire contenant les médias et identifiants. Le backend et le serveur frontend de test ont été arrêtés normalement, ainsi que le conteneur worker de test. Les autres conteneurs/volumes ne sont pas supprimés. Contrôle final : 10 vidéos dans la base applicative originale et fichier `Downloads/videoTest.mp4` préservés. Aucun vrai live n’a été utilisé ni commité.
