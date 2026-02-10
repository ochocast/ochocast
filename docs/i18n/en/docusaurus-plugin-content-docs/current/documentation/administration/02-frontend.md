# Front-End

## Description

The platform frontend.

The frontend of an application refers to the user interface (UI) and user experience (UX) components that users interact with directly. It runs on the client side — in the user's web browser or device.

## Installation and Prerequisites

After configuring the database and Keycloak, make sure to set environment variables in a `.env` file. You can copy `frontend/.env.example` to a new `.env` file in the `frontend` folder.

You can now run the frontend and backend (you may run both simultaneously from the project root).

From the `frontend` folder, if you haven't installed dependencies yet, run:

```bash
npm install
```

To run locally:

```bash
cd frontend
cp .env.example .env
npm run start
```

Running the backend and frontend at the same time from the project root is possible and convenient for development.

## Code Organization

- `public/`: static files (index.html, favicon, etc.).
- `src/assets/`: images, icons and static media.
- `src/components/`: reusable components.
- `src/pages/`: views corresponding to routes.
- `src/utils/`: shared utilities and interfaces.

## Design

Follow the OchoCast design system available in Figma for UI/UX.
