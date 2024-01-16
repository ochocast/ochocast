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
https://www.figma.com/file/0GxoYfFFf8THTYIxzYfHHD/Maquette-OctoCast?type=design&node-id=0-1&mode=design&t=eiEISBBvrEIffH9R-0

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

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can’t go back!**

If you aren’t satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you’re on your own.

You don’t have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn’t feel obligated to use this feature. However we understand that this tool wouldn’t be useful if you couldn’t customize it when you are ready for it.

## Documentation

### `npm run doc`

Create a typedoc documentation folder for backend in backend/docs

### Open documentation

## `cd docs/ && open index.html`

###  How to document code example:

```js
/**
 * Starts the application with given options
 * @param options options to start the application with
 * @param app the application to start
 * @returns a promise resolved true when the application is ready
 */
declare function startApplication(app: FooApplication, options: FooOptions): Promise<boolean>

```

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).
