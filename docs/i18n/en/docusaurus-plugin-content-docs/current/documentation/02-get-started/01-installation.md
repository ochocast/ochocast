# Installation

This guide explains how to install and configure OchoCast locally.

### Prerequisites

- **Git** installed on your machine
- **Docker and Docker Compose**
- **Node.js** (recommended version: LTS)
- **npm** or **yarn**

---

### 1. Clone the project

Clone the project from GitHub:

```bash
git clone <URL_DU_REPO_GITHUB>
cd octocast-webapp
```

---

### 2. Start services with Docker

From the project root, run:

```bash
docker-compose up -d
```

This `docker-compose.yml` file initializes the necessary services.

---

### 3. Keycloak Configuration

Keycloak is used for user authentication.

1. Navigate to the **localkeycloak** folder:

   ```bash
   cd localKeycloak
   cp .env.example .env
   ```

2. You can connect to Keycloak by visiting [http://localhost:8080](http://localhost:8080) in your browser.

3. Normally, the **local realm** is automatically imported via Docker Compose, but no user is created by default.

#### Creating a user in Keycloak

1. Access the Keycloak administration console.
2. Select your realm from the dropdown menu.
3. Click on **"Users"**, then on **"Add User"**.
4. Fill in the information (username, email, first name, last name).
5. Click **"Save"** to register the user.
6. Go to the **"Credentials"** tab, then set a password for the user.

---

### 4. Backend Configuration

1. Navigate to the **backend** folder:

   ```bash
   cd backend
   cp .env.example .env
   ```

2. Copy-paste the **"nest-back" client secret** from Keycloak into the `AUTH_SECRET` environment variable.

   **If the displayed secret is `\*\***` or similar, regenerate it before copying.\*\*

---

### 5. Frontend Configuration

1. Verify that the database and Keycloak are properly configured.
2. Navigate to the **frontend** folder:

   ```bash
   cd frontend
   cp .env.example .env
   ```

3. Copy the environment variables from the `.env.example` file to `.env` and configure them if necessary.

---

### 6. Launch the application

Once the services are configured, you can start the project.

#### Installing dependencies

In the **frontend** folder, run:

```bash
npm install
```

#### Start the project

Launch the frontend:

```bash
npm start
```

You can also launch **the backend and frontend at the same time** from the project root.

---

### Verification

- **Keycloak** is accessible via [http://localhost:8080](http://localhost:8080).
- **The backend** is accessible at `http://localhost:<PORT_BACKEND>`.
- **The frontend** is accessible at `http://localhost:<PORT_FRONTEND>`.

---

### Octocast is now ready to use

If you encounter any problems, make sure all environment variables are properly configured and all Docker services are started.
