# ochocast Backend

ochocast backend is built with NestJS, a progressive Node.js framework for building efficient, reliable and scalable server-side applications.

## Usage

In the `package.json` file, you will find several scripts that help with the development and running of the application:

- `start:dev`: Starts the application in development mode.
- `build`: Compiles the TypeScript code into JavaScript in the `dist` folder.
- `start:prod`: Starts the compiled JavaScript application from the `dist` folder.
- `test`: Runs the application's tests.
- `lint`: Runs the linter to check for code style issues.
- `format`: Formats the code using Prettier.

### API Documentation

A swagger is available at [http://localhost:3001/docs](http://localhost:3001/docs) when the application is running.

## Architecture

The backend architecture of ochocast is organized around the Hexagonal Architecture principles.
The codebase is further organized into modules, each encapsulating a specific functionality of the application.

You can find more details about the architecture in this [README file](HexArch.md).

## Documentation

`npm run doc`

Create a typedoc documentation folder for frontend in frontend/docs

### Open documentation

`cd docs/ && open index.html`

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

# Deployement
First ensure that you correctly [deployed the localkeycloack](../localKeycloak/README.md) before deploying the backend.
## To deploy in local:
```
cd ./backend
cp .env.example .env
```
Copy paste the secret of the "nest-back" client keycloak inside the `AUTH_SECRET` environement variable. (if the secret is ******** or anything similar, regenerate it before copy pasting it)
```
npm install
npm run start:dev
```


## To deploy in public:

Here is the docker recovery link: `rg.fr-par.scw.cloud/backend-images/ochocast-backend:latest`.

just clone it and run it.


## To test all features:

cd ./backend
```
npm run test:unit
```

## To test one specific feature:

cd ./backend
```
npx jest nameOfTheSpecFile
```

## To run migration:

npx ts-node -r tsconfig-paths/register ./node_modules/typeorm/cli.js migration:run -d src/config/typeorm.config.ts
```


