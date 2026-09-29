# Tester un upload local avec une vraie queue Scaleway

Ce test utilise une queue Scaleway **de développement**, mais garde le backend,
MinIO, PostgreSQL, le frontend et FFmpeg sur ton ordinateur. À chaque upload,
le backend déclenche automatiquement un pont à usage unique : il prend un
message de la queue, l'envoie au conteneur HTTP local, attend le résultat, puis
s'arrête. Ce n'est pas un worker permanent et rien ici ne déploie ou ne modifie
le staging.

## 1. Préparer la queue avec Terraform (recommandé)

Utilise le module **dédié au local** du dépôt voisin :
`ops-architecture-lab/terraform/ffmpeg-local-queue`. Ne lance pas le module
`ffmpeg-serverless`, qui prépare l'infrastructure staging complète.

Prépare les clés opérateur `SCW_ACCESS_KEY` / `SCW_SECRET_KEY` dans ton
environnement et active Queues une fois dans le projet/région de développement
via la console. Préfère un projet de développement dédié : les identifiants
Queues ont une portée projet/région, pas une queue unique.

Depuis la racine du dépôt `ops-architecture-lab` :

```bash
cd terraform/ffmpeg-local-queue
umask 077
cp local.tfvars.example local.tfvars
```

Renseigne le UUID du projet dans `local.tfvars`, puis :

```bash
export TF_WORKSPACE=default
terraform init -lockfile=readonly
terraform plan -var-file=local.tfvars -out=local.tfplan
# Vérifie le plan : une queue de test, trois accès Queues, une garde locale.
# Aucun conteneur/trigger/bucket/VM/staging ne doit apparaître.
terraform apply local.tfplan
```

`apply` crée réellement les ressources chez Scaleway, avec un coût d'usage
possible. Seule la queue est distante ; les vidéos restent dans MinIO local.
Conserve le state et les plans en privé : ils contiennent les clés.

### Alternative : queue créée dans la console

Crée une queue standard distincte nommée par exemple `ochocast-local-ffmpeg`
dans la région choisie. **N'y associe aucun trigger serverless et aucun autre
consommateur.** Configure un délai de visibilité supérieur au bail du job
(`TRANSCODING_LEASE_SECONDS`, 3600 secondes par défaut ; 3900 secondes convient).
Crée deux identifiants Queues dans ce projet : un avec la permission de publier
(`CanPublish`) pour le backend, un avec la permission de recevoir/supprimer
(`CanReceive`) pour le pont. Garde l'URL exacte de la queue et l'endpoint régional.

## 2. Configurer les services locaux

Si tu as utilisé le Terraform dédié, depuis `ochocast/backend` :

```bash
npm run local:queue-config
```

La commande lit l'état Terraform local et configure les fichiers `.env` du
backend et de FFmpeg sans afficher les clés. Elle préserve les réglages
base/auth/MinIO et les secrets existants, et sauvegarde la configuration
précédente dans `.env.local-queue.backup` au premier import. Elle n'effectue
aucun `apply` ni appel à Scaleway. Si les secrets backend/FFmpeg sont différents,
elle s'arrête avant modification ; harmonise-les sans casser les jobs existants.

Si les dépôts ne sont pas voisins :

```bash
npm run local:queue-config -- /chemin/ops-architecture-lab/terraform/ffmpeg-local-queue
```

Redémarre le backend et recrée le conteneur FFmpeg après l'import. Tu peux
ensuite passer directement à l'étape 3. **La queue Docker ElasticMQ n'est plus
utilisée lorsque `TRANSCODING_QUEUE_PROVIDER=scaleway`.**

Pour une queue créée manuellement dans la console, configure les valeurs
ci-dessous à la main :

Dans `backend/.env`, renseigne les variables `TRANSCODING_QUEUE_*` avec cette
queue et les identifiants de **publication**. Ajoute les variables
`LOCAL_QUEUE_BRIDGE_*` décrites dans `.env.example` : l'URL doit être identique
à `TRANSCODING_QUEUE_URL`, mais les identifiants du pont sont ceux de
**réception**. Le nom final de la queue doit contenir `local`, `dev` ou
`development` comme segment séparé par `-` ou `_` ; le backend refuse de démarrer
avec le pont automatique si la queue ne respecte pas cette règle. Ce mode
automatique s'active seulement avec `NODE_ENV=development` et
`LOCAL_QUEUE_BRIDGE_QUEUE_URL` renseignée. Ne commite pas le fichier `.env` ni
les clés.

Dans `ffmpegServer/.env`, mets exactement les **mêmes** valeurs
`TRANSCODING_DISPATCH_SECRET` et `TRANSCODING_CALLBACK_SECRET` que dans le
backend (deux secrets différents, au moins 32 caractères chacun). Le Docker
Compose FFmpeg utilise `host.docker.internal` pour joindre le backend et MinIO
sur l'ordinateur. Le backend local utilise MinIO à `localhost:9000`.

## 3. Démarrer le local

Dans un premier terminal :

```bash
cd dev-tools
docker compose up -d auth minio postgres
```

Dans un deuxième terminal :

```bash
cd backend
npm run start:dev
```

Dans un troisième terminal :

```bash
cd ffmpegServer
docker compose up --build -d --force-recreate
```

Vérifie que `http://localhost:8081/health` renvoie `{"status":"ok"}`. La
création des buckets MinIO `media` et `miniature` reste nécessaire comme pour
un démarrage local classique. La base doit posséder les tables vidéo et
`transcoding_job`. Dans ce checkout, les tables sont déjà présentes mais
l'historique des migrations est vide : **ne lance pas `migration:run` sur cette
base existante** sans vérifier/baseline le schéma, sous peine de collisions.

Dans un quatrième terminal, depuis la racine OchoCast :

```bash
cd frontend
npm start
```

Le frontend doit pointer sur le backend local (`http://localhost:3001`).

## 4. Envoyer une courte vidéo

Dépose une vidéo de 5 à 10 secondes dans OchoCast local. L'upload doit publier
un message dans la queue Scaleway de développement ; le backend lance alors
le pont tout seul, sans autre commande. Les logs du backend indiquent la
publication puis la confirmation du traitement FFmpeg. Les uploads simultanés
sont traités l'un après l'autre par le conteneur local.

Vérifie que la vidéo passe à `ready`, se lit sur OchoCast et que les
playlists/segments HLS 360p, 480p et 720p existent dans le bucket `media`.
Le lecteur peut choisir la qualité automatiquement ; la présence d'un menu de
qualité dépend du frontend.

Les logs doivent montrer `Published scaleway transcoding job ...`, puis
`Local FFmpeg processed queue message ...`. Un message peut être consommé si
vite qu'il n'apparaît pas dans la console Scaleway : sa disparition après
succès est normale. Pour confirmer les qualités, consulte aussi les objets
HLS dans MinIO ; ne te fie pas uniquement au menu du lecteur.

La commande manuelle reste disponible uniquement pour reprendre un message
resté dans la queue après une panne locale :

```bash
cd backend
npm run local:queue-bridge
```

Cette commande effectue une seule attente de 10 secondes, traite au maximum
un message et se termine. Elle n'est pas nécessaire pour un upload normal.

Si la queue est vide, vérifie l'URL et les identifiants de publication du
backend. Si FFmpeg renvoie une erreur, le pont **ne supprime pas le message** :
il redevient visible après le délai de visibilité de la queue. Les logs du
backend, du conteneur FFmpeg et l'état du job indiquent la cause. Une panne
survenue après la publication peut nécessiter la reprise manuelle ci-dessus ;
il n'y a pas de polling permanent. Ne teste pas ce pont sur la queue de staging.

Ce parcours vérifie réellement `SendMessage`, `ReceiveMessage`, FFmpeg,
`DeleteMessage` et la lecture locale. Il ne valide pas le trigger ni
l'autoscaling des conteneurs serverless ; ceux-ci restent à tester en staging.
