# webapp

Environment variable necessary to access the login page :
REACT_APP_CLIENT_ID
REACT_APP_REDIRECT_URI
REACT_APP_AUTHORIZATION_ENDPOINT

## Lint and format project

```bash
# run linting in front and back
$ npm run lint

# run prettie in front and back
$ npm run format
```

## Open documentation

### Generate documentation:

The documentation command `npm run doc` will generate documentation for `/frontend` and `/backend` folder

### `cd docs/ && open index.html`

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
