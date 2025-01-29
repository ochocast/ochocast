# Installation

Ce guide explique comment installer et configurer OchoCast en local.

### Prérequis

- **Git** installé sur votre machine
- **Docker et Docker Compose**
- **Node.js** (version recommandée : LTS)
- **npm** ou **yarn**

---

### 1. Cloner le projet

Clonez le projet depuis GitHub :

```bash
git clone <URL_DU_REPO_GITHUB>
cd octocast-webapp
```

---

### 2. Démarrer les services avec Docker

Depuis la racine du projet, exécutez :

```bash
docker-compose up -d
```

Ce fichier `docker-compose.yml` initialise les services nécessaires.

---

### 3. Configuration de Keycloak

Keycloak est utilisé pour l'authentification des utilisateurs.

1. Accédez au dossier **localkeycloak** :

   ```bash
   cd localkeycloak
   cp .env.example .env
   ```

2. Vous pouvez vous connecter à Keycloak en visitant [http://localhost:8080](http://localhost:8080) dans votre navigateur.

3. Normalement, le **realm local** est importé automatiquement via Docker Compose, mais aucun utilisateur n'est créé par défaut.

#### Création d'un utilisateur dans Keycloak

1. Accédez à la console d'administration Keycloak.
2. Sélectionnez votre realm dans le menu déroulant.
3. Cliquez sur **"Users"**, puis sur **"Add User"**.
4. Remplissez les informations (nom d’utilisateur, e-mail, prénom, nom).
5. Cliquez sur **"Save"** pour enregistrer l'utilisateur.
6. Rendez-vous dans l'onglet **"Credentials"**, puis définissez un mot de passe pour l'utilisateur.

---

### 4. Configuration du Backend

1. Accédez au dossier **backend** :

   ```bash
   cd backend
   cp .env.example .env
   ```

2. Copiez-collez le **secret du client "nest-back"** de Keycloak dans la variable d’environnement `AUTH_SECRET`.

   **Si le secret affiché est `\*\***` ou similaire, régénérez-le avant de le copier.\*\*

---

### 5. Configuration du Frontend

1. Vérifiez que la base de données et Keycloak sont bien configurés.
2. Accédez au dossier **frontend** :

   ```bash
   cd frontend
   cp .env.example .env
   ```

3. Copiez les variables d’environnement du fichier `.env.example` vers `.env` et configurez-les si nécessaire.

---

### 6. Lancer l'application

Une fois les services configurés, vous pouvez démarrer le projet.

#### Installation des dépendances

Dans le dossier **frontend**, exécutez :

```bash
npm install
```

#### Démarrer le projet

Lancez le frontend :

```bash
npm start
```

Vous pouvez également lancer **le backend et le frontend en même temps** depuis la racine du projet.

---

### Vérification

- **Keycloak** est accessible via [http://localhost:8080](http://localhost:8080).
- **Le backend** est accessible sur `http://localhost:<PORT_BACKEND>`.
- **Le frontend** est accessible sur `http://localhost:<PORT_FRONTEND>`.

---

### Octocast est maintenant prêt à être utilisé

Si vous rencontrez des problèmes, assurez-vous que toutes les variables d’environnement sont bien configurées et que tous les services Docker sont démarrés.
