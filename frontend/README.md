## Description

The frontend of the streaming platform.

The frontend of an application refers to the user interface (UI) and user experience (UX) components that users interact with directly. It's the part of the software that runs on the client side, meaning it's executed in the user's web browser or device.

## Installation and requirements

Once you have set up the database and the keycloak, you must not forget to set up the environment variables in a .env file.
You can copy the file “/frontend/.env.example” into a new “.env” file in the frontend folder.

Now you can proceed to run the frontend and the backend (you can run both at once from the root of the project).

From the folder “frontend”, if you have not yet installed the necesssary dependencies, run:

### `npm install`

Then you can run:

### `npm start`

## Frontend structure

In “/frontend/src/”, you will find several folders with different purposes.

* Assets :
This folder contains every static file such as images, icons, media, and other ressources that are not expected to change during the execution of the application. These are essential for the interface and design of the application.

* Components :
In this folder, you can find differents layouts and elements that are used in different pages of the application. They are reusable, can adapt to the different properties and most of the time separated in small elements.

* Pages :
Pages are also components. However, they are not to be reused and represent entire views of the application. Each file or subfolder within the “pages” directory typically corresponds to a specific route in your application.
This structure helps maintain a clear separation between different sections of your user interface.

* Utils :
Typically contains interfaces, utility functions or helper modules that provide commonly used functionality throughout the application. The purpose of the folder is to centralize and organize functions that don’t belong to a specific component or module.  For example, a date formatting function and/or interface.

## UX / UI design

The frontend application design must respect the Octo’s design system.

You can find the figma link to the website design here:
https://www.figma.com/file/0GxoYfFFf8THTYIxzYfHHD/Maquette-ochocast?type=design&node-id=0-1&mode=design&t=eiEISBBvrEIffH9R-0

Then, on the navigation panel on the left, you can click on “Assets” and find Octo’s design system.

## How to call an endpoint in your frontend page

If you need to call an endpoint from the backend, you will have to use the file api.js.

For example, to get a specific event you will need to add the function that will call the endpoint “/events?id=”xx”’ in your api.js.
 export const getEvent = (eventId) => api.get(`/events?id=${eventId}`); 

Now you can call this function in your frontend file in a try catch :

```js
try {
  const res = await getEvent(eventId);
  if (res.status === 200) {
  // TODO
  }
} catch (error) {
  console.error("Failed to fetch event: ${error}");
}
```

Depending on your need you can use :
api.get/put/post/delete...

For more information :https://www.npmjs.com/package/apisauce

## Adding a new view to the application

To add a new view, you must add it’s route in App.tsx inside the “<Routes/>” element.
First create the folder and the component of the page in “/frontend/src/pages” where you will have the tsx and css files.

```html
<Route
path="/theUrlPath"
element={<ProtectedRoute Element={NameOfComponent} />}
/>
```

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

# Deployement
First ensure that you correctly [deployed the localkeycloack](../localKeycloak/README.md) before deploying the backend.
## To deploy in local:
```
cd ./frontend
cp .env.example .env
npm install
npm run start
```

## To deploy in public:

Here is the docker recovery link.

just clone it and run it.

---

## 🌐 How to add a new language to the application

The app uses `react-i18next` for translations.

To add a new language:

1. In `frontend/src/locales/`, create a new folder with the language code (e.g., `es` for Spanish).
2. Add a `translation.json` file inside:

```
/src/locales/es/translation.json
```

3. Fill it with your translations (copy the structure of an other translation file):

```json
{
  "home": "Inicio",
  "logout": "Cerrar sesión"
}
```

The app will automaticly detect and integrate the language added.
