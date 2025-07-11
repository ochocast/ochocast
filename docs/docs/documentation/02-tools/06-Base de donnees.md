# Base de données

Dans ce projet, nous utilisons TypeORM pour interagir avec la base de données PostgreSQL.

Lorsqu'on change une propriété d'une entity (exemple du fichier : /backend/src/tags/infra/gateways/entities/tag.entity.ts), cela change la description de l'objet en base de données (par exemple ajouter un champ "toto" dans l'entity va ajouter une colonne "toto" à la table tag_entity).

Ces changements peuvent être appliqués automatiquement en créant et éxécutant une migration.

## 1- Créer une migration 

Après avoir changé les champs dans l'entity, ouvrir un terminal dans le dossier /backend/

Pour générer une migration, utiliser la commande "npm run migration:generate"

Une nouvelle migration a été créée dans le dossier /backend/migrations, il faut s'assurer que les changements de la migration (en requêtes postgreSQL) correspondent aux changements qui ont été effectués dans l'entity.

## 2- Exécuter une migration

Pour éxécuter une migration (et donc appliquer les changements à la base de données), dans le dossier /backend/, utiliser la commande "npm run migration:run".

Si il n'y a pas de message d'erreurs, les modifications ont étées appliquées dans la base de données locale.

## 3- Application en production

Grâce à la CI / CD, les migrations qui ont étées push sont automatiquement effectuées lors de la mise en production avec les mêmes commandes qu'en local

## 4- Résolution de problèmes

Si problème survient lors de l'éxécution des migrations, il y a plusieurs points à vérifier :
- est-ce que les changements ont déjà été appliqués sans la migration ?
- est-ce que les changements sont impossible à appliquer à cause de contraintes (création d'une nouvelle colonne qui ne peut pas être NUL et sans valeur par défaut)

### 4.1- Les changements sont déjà appliqués

Si tous les changements de la migration sont déjà en base, il est possible d'ajouter directement la migration aux migrations effectuées dans la base de données postgreSQL.

Pour résoudre ce problème :
- se connecter manuellement à la base de données et vérifier la table "migrations"
- insérer dans la table "migrations" les valeurs suivantes l'identifiant de la migration (name) et le timestamp actuel (timestamp)

vérifier que la migration a bien été ajoutée en relançant la commande "npm run migration:run"

### 4.2- Une colonne à NULL pose problème

Ajouter une valeur par défaut ou supprimer la contrainte NOT NULL de la colonne dans l'entity, supprimer le fichier de migration qui pose problème puis relance les commandes de génération et d'éxécution de migration.