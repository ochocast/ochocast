# Front-End

## Description

The frontend of the streaming platform.

The frontend of an application refers to the user interface (UI) and user experience (UX) components that users interact with directly. It's the part of the software that runs on the client side, meaning it's executed in the user's web browser or device.

## Installation and Requirements

Once you have set up the database and Keycloak, you must not forget to set up the environment variables in a `.env` file.
You can copy the file `frontend/.env.example` into a new `.env` file in the frontend folder.

Now you can proceed to run the frontend and the backend (you can run both at once from the root of the project).

From the folder `frontend`, if you have not yet installed the necessary dependencies, run:

```bash
npm install
```

To Deploy Locally:

```
cd ./frontend
cp .env.example .env
npm run start
```

## Frontend Structure

In frontend/src, you will find several folders with different purposes.

Public: This folder contains static files that are served directly by the web server. These files are not processed by the build system and are accessible via the root URL of your application. Common files in this folder include index.html, favicon, and other assets that need to be publicly accessible.

Assets: This folder contains every static file such as images, icons, media, and other resources that are not expected to change during the execution of the application. These are essential for the interface and design of the application.

Components: In this folder, you can find different layouts and elements that are used in different pages of the application. They are reusable, can adapt to the different properties, and are most of the time separated into small elements.

Pages: Pages are also components. However, they are not to be reused and represent entire views of the application. Each file or subfolder within the pages directory typically corresponds to a specific route in your application. This structure helps maintain a clear separation between different sections of your user interface.

Utils: Typically contains interfaces, utility functions, or helper modules that provide commonly used functionality throughout the application. The purpose of the folder is to centralize and organize functions that don’t belong to a specific component or module. For example, a date formatting function and/or interface.

## UX / UI Design

The frontend application design must respect the OchoCast’s design system set in the figma.
