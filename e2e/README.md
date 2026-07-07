# End-to-End (E2E) Testing - Playwright

This folder contains the configuration and End-to-End tests for the **Ochocast** application.

E2E tests simulate complete user journeys by controlling real browsers (Chromium, Firefox, WebKit).

---

## 🚀 Running the tests

### Locally (command line)
```bash
npm run test:e2e
```

### Locally (Interactive UI Mode)
Recommended for development and debugging. Opens a graphical interface showing step-by-step execution:
```bash
npm run test:e2e:ui
```

### Record a new test (Codegen)
Automatically generates the test code by recording your clicks and keystrokes in the browser:
```bash
npx playwright codegen http://localhost:3000
```

### Run a specific test (headed mode)
To run only a specific test file (e.g., the authentication setup) with the browser visible:
```bash
npx playwright test e2e/auth.setup.ts --headed
```

---

## 🔒 Authentication Management (Keycloak)

To optimize execution time and avoid the overhead of a full Keycloak login for each test file, we use Playwright's **Global Setup** feature:

1. The [auth.setup.ts](file:///Users/tbriens/Documents/epita/pae/ochocast/e2e/auth.setup.ts) script runs first.
2. It navigates to the Ochocast home page, clicks the login button, enters the test credentials, and waits to be redirected.
3. It saves the session state (cookies and localStorage) to the temporary file `playwright/.auth/user.json`.
4. All tests in `e2e/tests` automatically load this state and start in an authenticated state.

### Keycloak Requirements Locally
By default, the locally imported Keycloak container does not contain a pre-configured test user. Before running the tests, make sure you have created a test user in your local Keycloak instance (http://localhost:8080) under the `local-realm` realm, and configure the following environment variables or modify the `auth.setup.ts` file:

- **Default username:** `test-user`
- **Default password:** `test-password`

---

## 📁 File Structure

- `playwright.config.ts`: Global Playwright configuration at the root.
- `e2e/`:
  - `auth.setup.ts`: Initial login and session caching script.
  - `tests/`: Folder containing test specifications (e.g., `login.spec.ts`, etc.).
- `playwright-report/`: HTML report generated after execution.
