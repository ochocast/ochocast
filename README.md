# webapp

Environment variable necessary to access the login page :
REACT_APP_CLIENT_ID
REACT_APP_REDIRECT_URI
REACT_APP_AUTHORIZATION_ENDPOINT

## Lint and format project

```bash
# run linting in front and back
$ npm run lint

# run prettier in front and back
$ npm run format
```

## Open documentation

### Generate documentation:

The documentation command `npm run doc` will generate documentation for `/frontend` and `/backend` folder

### `cd docs/ && open index.html`

### How to document code example:

```js
/**
 * Starts the application with given options
 * @param options options to start the application with
 * @param app the application to start
 * @returns a promise resolved true when the application is ready
 */
declare function startApplication(app: FooApplication, options: FooOptions): Promise<boolean>

```

# Recurrents issues on project setup

### Frontend

Nothing happens when you start the front-end and click on the login button of Keycloak ?

This issue is linked with your `.env` file. 
Verify that you correctly created the `.env` file.

### Backend Link problem with the db

#### 1. Verify that you don't have postgresql system service that overwrite the docker db.
  
  Change the bind port of your machine in the [docker compose file](./database/docker-compose.yml).
  And change the port of the [.env file](./backend/.env) to the same one.
  
  If it's works with this new ip, this is probably the same issue.

  We uninstall the postgresql system service :
  On mac with `launchctl`.
  On Linux with `systemctl`.

#### 2. Problem with pseudo bash like git-bash

  The bash can have some problem with character encoding and failed the db connecting because of the wrong username.
