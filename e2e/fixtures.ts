import { test as base, expect, type Page } from '@playwright/test';

const apiUrl = process.env.PLAYWRIGHT_API_URL || 'http://localhost:3001/api';

/** Reads the OIDC access token that the app stored in localStorage after login. */
async function getAccessToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    const key = Object.keys(window.localStorage).find((k) =>
      k.startsWith('oidc.user:'),
    );
    return key
      ? JSON.parse(window.localStorage.getItem(key) as string).access_token
      : null;
  });
  if (!token) throw new Error('No OIDC access token found in localStorage');
  return token;
}

type Fixtures = {
  /**
   * Register an event id to be deleted (through the API) when the test ends,
   * pass or fail. Keeps the database clean so tests can be re-run.
   */
  trackEvent: (eventId: string) => void;
  /** Resolves with the id of the next event created through the UI. */
  waitForCreatedEvent: () => Promise<string>;
};

export const test = base.extend<Fixtures>({
  trackEvent: async ({ page, request }, use) => {
    const ids: string[] = [];
    await use((id) => ids.push(id));

    if (ids.length === 0) return;
    const token = await getAccessToken(page);
    for (const id of ids) {
      await request.delete(`${apiUrl}/events/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  },

  waitForCreatedEvent: async ({ page, trackEvent }, use) => {
    await use(async () => {
      const response = await page.waitForResponse(
        (res) =>
          res.url().startsWith(`${apiUrl}/events`) &&
          res.request().method() === 'POST',
      );
      const { id } = await response.json();
      trackEvent(id);
      return id;
    });
  },
});

export { expect };
