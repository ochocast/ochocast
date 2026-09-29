# End-to-End (E2E) Testing - Playwright

E2E tests drive a real browser against the full Ochocast stack (frontend, backend, Keycloak, Postgres, MinIO, RabbitMQ) and check complete user journeys.

- Tests run on **Chromium** by default. Set `E2E_ALL_BROWSERS=1` to also run Firefox and WebKit.
- They run in CI on **every pull request to `main`**, and again before images are built and promoted (see [CI](#ci)).

---

## Quick start

Prerequisites: Docker running, `npm install` done at the repo root, `frontend/.env` and `backend/.env` created from their `.env.example`.

```bash
# 1. Start the infrastructure (Keycloak, Postgres, MinIO, RabbitMQ, ffmpeg worker)
cd dev-tools && docker compose up -d && cd ..

# 2. Install the browsers (once)
npx playwright install chromium

# 3. Run the tests. Playwright starts the backend and frontend itself
#    (and reuses them if they are already running on :3001 / :3000).
npm run test:e2e
```

| Command | What it does |
|---|---|
| `npm run test:e2e` | Run all tests headless |
| `npm run test:e2e:ui` | Interactive UI mode (best for writing/debugging) |
| `npm run test:e2e:report` | Open the last HTML report |
| `npm run test:e2e:reset` | Wipe DB + MinIO and restart the containers (clean slate) |
| `npx playwright test e2e/tests/foo.spec.ts --headed` | One file, visible browser |
| `npx playwright test -g "create an event"` | Filter by test title |
| `npx playwright codegen http://localhost:3000` | Record clicks to bootstrap a test |

Traces, screenshots and videos of failures are in `test-results/`; the HTML report is in `playwright-report/`.

---

## Layout

```
playwright.config.ts   Global config (projects, webServers, retries, reporters)
e2e/
  auth.setup.ts        Logs in through Keycloak once, saves the session
  fixtures.ts          Custom `test` with helpers (event cleanup, ...)
  tests/*.spec.ts      The tests
playwright/.auth/      Saved session (git-ignored, generated)
```

## Authentication

`auth.setup.ts` runs first (Playwright project `setup`), logs in as the Keycloak test user and stores cookies + localStorage in `playwright/.auth/user.json`. Every test then starts **already logged in**: just `page.goto('/...')`.

The user `test-user` / `test-password` is part of the realm import (`dev-tools/localKeycloak/config/realm-export.json`), so there is nothing to create by hand. `playwright/.auth/` holds live session tokens and is git-ignored: never commit it.

Environment variables (all optional):

| Variable | Default |
|---|---|
| `PLAYWRIGHT_BASE_URL` | `http://localhost:3000` |
| `PLAYWRIGHT_KEYCLOAK_URL` | `http://localhost:8080` |
| `PLAYWRIGHT_API_URL` | `http://localhost:3001/api` |
| `PLAYWRIGHT_TEST_USER` / `PLAYWRIGHT_TEST_PASSWORD` | `test-user` / `test-password` |
| `E2E_ALL_BROWSERS` | unset (Chromium only) |

---

## Writing a new test

1. Create `e2e/tests/<feature>.spec.ts`. Import `test` and `expect` from `../fixtures` (not from `@playwright/test`) to get the helpers.
2. Follow the rules below.
3. Run it with `npm run test:e2e:ui` until it is stable, then run it 3 times in a row headless.

```ts
import { test, expect } from '../fixtures';

test('create an event', async ({ page, waitForCreatedEvent }) => {
  const name = `E2E Event ${Date.now()}`;          // unique name
  await page.goto('/my-events/create');
  await page.getByTestId('event-name-input').fill(name);
  // ...
  const created = waitForCreatedEvent();            // registers the event for cleanup
  await page.getByTestId('event-submit-button').click();
  await created;
  await expect(page.getByTestId('event-card').filter({ hasText: name })).toBeVisible();
});
```

### Rules

- **Independent and re-runnable.** A test must not rely on data left by another test or on an empty DB. Use unique names (`Date.now()`), and delete what you create. Use the fixtures in `e2e/fixtures.ts`:
  - `waitForCreatedEvent()` waits for the next `POST /events` and registers the id;
  - `trackEvent(id)` registers any event id;
  - everything registered is deleted through the API after the test, pass or fail.
  - If you create another kind of resource, add a similar fixture (create/track/delete) in `fixtures.ts`.
- **Stable selectors, in this order of preference:**
  1. `getByRole(...)` / `getByLabel(...)` / `getByPlaceholder(...)`;
  2. `getByTestId('...')`, adding `data-testid="..."` in the frontend when the element has no good accessible name. Naming: `<feature>-<element>[-<kind>]`, e.g. `event-name-input`, `event-card`. `Button` accepts a `testId` prop.
  3. Never `.nth(4)`, CSS classes (they are CSS-module hashed) or text that depends on the current date/data.
- **No `waitForTimeout`.** Use web-first assertions (`await expect(locator).toBeVisible()`), they auto-wait and retry.
- **Assert on results the user sees**, not on implementation details.
- **Keep tests short and focused** on one journey. Put shared setup in fixtures, not copy-pasted steps.
- **Timeouts:** 30 s per test, 5 s per assertion (see `playwright.config.ts`). If you need more, fix the cause first.

---

## CI

Workflow: `.github/workflows/e2e.yml` (job **`run-e2e-tests`**, self-hosted runner).

- **On every PR to `main`**: it starts the Docker services, waits for Keycloak, runs the tests (Playwright boots the backend and frontend), uploads the `playwright-report` artifact (30 days) and tears everything down. Concurrent runs on the same PR are cancelled.
- **Before deploy**: `.github/workflows/main.yml` calls the same workflow (`e2e` job) after a push to `main`; the image build jobs and the GitOps promotion `need` it, so a failing E2E run blocks the promotion. It is skipped only when neither frontend nor backend changed.
- **To block merges**, `run-e2e-tests` must be marked as a *required status check* in the `main` branch protection rules (GitHub → Settings → Branches). This cannot be configured from the repo files.
- The runner needs the Playwright system deps installed once: `npx playwright install-deps`.
- On CI: 1 worker, 2 retries, `forbidOnly`. Traces/videos are kept on the first retry. Download the report artifact and run `npx playwright show-report <folder>` to inspect a failure.

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `setup` fails waiting for Keycloak URL | Keycloak not up yet: `npx wait-on http://localhost:8080/realms/local-realm` |
| Login form rejects credentials | Realm not re-imported: `npm run test:e2e:reset` |
| Test passes alone, fails in a full run | Shared data between tests: make names unique / clean up |
| `port 3001/3000 already in use` in CI | Stale processes: `npx kill-port 3000 3001` |
| Weird leftover events locally | `npm run test:e2e:reset` |
