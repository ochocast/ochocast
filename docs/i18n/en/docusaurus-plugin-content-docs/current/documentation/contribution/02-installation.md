# Installation

This guide explains how to install and configure OchoCast locally.

### Prerequisites

- **Git** installed
- **Docker and Docker Compose**
- **Node.js** (recommended: LTS)
- **npm** or **yarn**

---

### 1. Clone the project

Clone the repository from GitHub:

```bash
git clone <GITHUB_REPO_URL>
cd ochocast
```

---

### 2. Start services with Docker

From the project root, run:

```bash
docker-compose up -d
```

This `docker-compose.yml` brings up the necessary services.

---

### 3. Keycloak configuration

Keycloak is used for user authentication.

1. Go to the `localKeycloak` folder:

```bash
cd localKeycloak
cp .env.example .env
```

2. Open [http://localhost:8080](http://localhost:8080) in your browser to access Keycloak.

3. The local realm is usually imported automatically via Docker Compose, but no users are created by default.

#### Creating a user in Keycloak

1. Open the Keycloak admin console.
2. Select your realm from the dropdown.
3. Click “Users”, then “Add User”.
4. Fill in username, email, first name and last name.
5. Click “Save”.
6. In the “Credentials” tab, set a password for the user.

---

### 4. Backend configuration

1. Go to the `backend` folder:

```bash
cd backend
cp .env.example .env
```

2. Copy the `nest-back` client secret from Keycloak into the `AUTH_SECRET` environment variable.

---

### 5. Frontend configuration

1. Ensure the database and Keycloak are configured.
2. Go to the `frontend` folder:

```bash
cd frontend
cp .env.example .env
```

3. Copy environment variables from `.env.example` to `.env` and configure them as needed.

---

### 6. Start the application

After configuration, start the project.

#### Install dependencies

In the `frontend` folder run:

```bash
npm install
```

#### Start the frontend

```bash
npm start
```

You can also run the backend and frontend together from the project root.

---

### Verification

- **Keycloak** should be available at [http://localhost:8080](http://localhost:8080).
- **Backend** should be accessible at `http://localhost:<BACKEND_PORT>`.
- **Frontend** should be accessible at `http://localhost:<FRONTEND_PORT>`.

---

### OchoCast is ready to use

If you encounter issues, verify environment variables and ensure all Docker services are up.
