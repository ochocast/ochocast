# Frontend

## Description

The frontend of the streaming platform.

The frontend of an application refers to the user interface (UI) and user experience (UX) components that users directly interact with. It is the part of the software that runs on the client side, meaning it is executed in the user's web browser or device.

## Installation and Prerequisites

Once you have configured the database and Keycloak, don't forget to configure the environment variables in a `.env` file. You can copy the `frontend/.env.example` file to a new `.env` file in the frontend folder.

You can now proceed to run the frontend and backend (you can run both simultaneously from the project root).

From the `frontend` folder, if you haven't installed the necessary dependencies yet, run:

```bash
npm install
```

To deploy locally:

```
cd ./frontend
cp .env.example .env
npm run start
```

## Frontend Structure

In frontend/src, you will find several folders with different purposes.

Public: This folder contains static files that are served directly by the web server. These files are not processed by the build system and are accessible via the root URL of your application. Common files in this folder include index.html, favicon, and other resources that need to be publicly accessible.

Assets: This folder contains all static files such as images, icons, media, and other resources that are not expected to change during application runtime. These files are essential for the interface and design of the application.

Components: In this folder, you will find different layouts and elements used in the various pages of the application. They are reusable, can adapt to different properties, and are often separated into small elements.

Pages: Pages are also components. However, they are not intended to be reused and represent entire views of the application. Each file or subfolder in the pages folder typically corresponds to a specific route of your application. This structure allows maintaining a clear separation between different sections of your user interface.

Utils: This folder typically contains interfaces, utility functions, or helper modules that provide commonly used functionality throughout the application. The purpose of this folder is to centralize and organize functions that are not related to a specific component or module. For example, a date formatting function or an interface.

## UX / UI Design

The frontend application design must respect OchoCast's design system established in Figma.
