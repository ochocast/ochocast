import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { APIRequestContext, Page } from '@playwright/test';
import { test, expect, getAccessToken } from '../fixtures';

// Content search: GET /api/search, the results page and the video page.
// Each test publishes its own video with a WebVTT file holding a word that
// exists nowhere else, so tests stay independent and re-runnable.

const apiUrl = process.env.PLAYWRIGHT_API_URL || 'http://localhost:3001/api';

/** A made-up word, letters only, unique to this run. */
function uniqueWord(): string {
  const letters = 'bcdfghjklmnpqrstvwxz';
  let word = 'zq';
  for (let i = 0; i < 8; i++) {
    word += letters[Math.floor(Math.random() * letters.length)];
  }
  return word;
}

interface Cue {
  start: string;
  end: string;
  text: string;
}

function webVtt(cues: Cue[]): Buffer {
  const body = cues
    .map((cue) => `${cue.start} --> ${cue.end}\n${cue.text}`)
    .join('\n\n');
  return Buffer.from(`WEBVTT\n\n${body}\n`);
}

/**
 * Publishes the 3-second test video with the given subtitles, waits until it
 * is ready and its subtitles are searchable. Returns its id.
 */
async function publishWithSubtitles(
  page: Page,
  request: APIRequestContext,
  trackVideo: (id: string) => void,
  title: string,
  cues: Cue[],
  searchableBy: string,
): Promise<string> {
  await page.goto('/video/video-settings');
  await page.getByPlaceholder('Title').fill(title);
  await page.getByPlaceholder('Description').fill('E2E content search');
  await page.getByLabel('Slide or choose your media').setInputFiles({
    name: 'e2e-search.mp4',
    mimeType: 'video/mp4',
    buffer: await readFile(path.resolve('e2e/assets/video-short.mp4')),
  });
  await page.getByLabel('Drag or choose your subtitle file').setInputFiles({
    name: 'subtitles.vtt',
    mimeType: 'text/vtt',
    buffer: webVtt(cues),
  });
  const completion = page.waitForResponse(
    (response) =>
      response.url().includes('/video-uploads/') &&
      response.url().endsWith('/complete') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Publish video' }).click();
  const response = await completion;
  expect(response.ok()).toBeTruthy();
  const { id } = await response.json();
  trackVideo(id);

  // Indexed right after the upload completes: wait until the API finds it.
  const headers = { Authorization: `Bearer ${await getAccessToken(page)}` };
  await expect
    .poll(
      async () => {
        const search = await request.get(
          `${apiUrl}/search?q=${encodeURIComponent(searchableBy)}`,
          { headers },
        );
        if (!search.ok()) return `http-${search.status()}`;
        const body = await search.json();
        return body.videos.some(
          (hit: { video: { id: string } }) => hit.video.id === id,
        );
      },
      { timeout: 90_000, intervals: [1000, 2000, 5000] },
    )
    .toBe(true);
  return id;
}

/** Types a query in the header search bar and submits it. */
async function searchFor(page: Page, query: string) {
  const input = page.getByPlaceholder('Search videos and events');
  await input.fill(query);
  await input.press('Enter');
  await expect(page).toHaveURL(/\/search\?/);
}

function resultCard(page: Page, title: string) {
  return page.getByRole('article').filter({ hasText: title });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('lang', 'en'));
});

test('finds a word said in the subtitles and shows the passage', async ({
  page,
  request,
  trackVideo,
}) => {
  test.setTimeout(150_000);
  const word = uniqueWord();
  const title = `E2E search passage ${uniqueWord()}`;
  await publishWithSubtitles(
    page,
    request,
    trackVideo,
    title,
    [
      { start: '00:00:00.000', end: '00:00:01.000', text: 'Bonjour à tous.' },
      {
        start: '00:00:01.000',
        end: '00:00:02.500',
        text: `On parle maintenant de ${word} en détail.`,
      },
    ],
    word,
  );

  await page.goto('/');
  await searchFor(page, word);

  const card = resultCard(page, title);
  await expect(card).toBeVisible();
  await expect(card.getByText('Transcript · 1 passage')).toBeVisible();
  const passage = card.getByRole('link', { name: /0:01/ });
  await expect(passage).toContainText(`On parle maintenant de ${word}`);
  await expect(passage.locator('mark')).toHaveText(word);
});

test('a passage opens the video at its time', async ({
  page,
  request,
  trackVideo,
}) => {
  test.setTimeout(150_000);
  const word = uniqueWord();
  const title = `E2E search jump ${uniqueWord()}`;
  const id = await publishWithSubtitles(
    page,
    request,
    trackVideo,
    title,
    [
      { start: '00:00:00.000', end: '00:00:01.500', text: 'Introduction.' },
      {
        start: '00:00:02.000',
        end: '00:00:03.000',
        text: `Voici le passage sur ${word}.`,
      },
    ],
    word,
  );

  await page.goto(`/search?q=${word}`);
  await resultCard(page, title).getByRole('link', { name: /0:02/ }).click();

  await expect(page).toHaveURL(new RegExp(`/video/${id}\\?t=2&q=${word}$`));
  await expect(
    page.getByRole('status').filter({ hasText: 'Playing from 0:02' }),
  ).toBeVisible();
  await expect(
    page.getByRole('group', { name: 'Passages found in the video' }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator('video')
        .evaluate((video) => (video as HTMLVideoElement).currentTime),
    )
    .toBeCloseTo(2, 0);
});

test('excludes videos with -word', async ({ page, request, trackVideo }) => {
  test.setTimeout(150_000);
  const word = uniqueWord();
  const excluded = uniqueWord();
  const title = `E2E search exclusion ${uniqueWord()}`;
  await publishWithSubtitles(
    page,
    request,
    trackVideo,
    title,
    [
      {
        start: '00:00:00.500',
        end: '00:00:02.000',
        text: `Il est question de ${word} et de ${excluded}.`,
      },
    ],
    word,
  );

  await page.goto('/');
  await searchFor(page, word);
  await expect(resultCard(page, title)).toBeVisible();

  await searchFor(page, `${word} -${excluded}`);
  await expect(
    page.getByText(`No video matches “${word} -${excluded}”.`),
  ).toBeVisible();
  await expect(resultCard(page, title)).toHaveCount(0);
});

test('lists videos with filters only, newest first, without passages', async ({
  page,
  request,
  trackVideo,
}) => {
  test.setTimeout(150_000);
  const word = uniqueWord();
  const title = `E2E search filters ${uniqueWord()}`;
  const since = new Date(Date.now() - 1000).toISOString();
  await publishWithSubtitles(
    page,
    request,
    trackVideo,
    title,
    [{ start: '00:00:00.500', end: '00:00:02.000', text: `Mot ${word}.` }],
    word,
  );

  await page.goto(`/search?dateFrom=${encodeURIComponent(since)}`);

  const card = resultCard(page, title);
  await expect(card).toBeVisible();
  // No query: nothing to show where it was found, no passage.
  await expect(card.getByText('Found in:')).toHaveCount(0);
  await expect(card.getByRole('link', { name: /▶/ })).toHaveCount(0);
});

test('the ? button explains the advanced search and runs an example', async ({
  page,
}) => {
  await page.goto('/');
  const help = page.getByRole('button', { name: 'Advanced search help' });
  await help.click();

  const panel = page.getByRole('dialog', { name: 'Advanced search' });
  await expect(panel).toBeVisible();
  await expect(panel.getByText('"données personnelles"')).toBeVisible();
  await expect(panel.getByText('kubernetes -docker')).toBeVisible();

  await panel.getByRole('button', { name: 'ffmpeg or rgpd' }).click();

  await expect(panel).toBeHidden();
  await expect(page).toHaveURL(/\/search\?q=ffmpeg(\+|%20)or(\+|%20)rgpd/);
  await expect(page.getByPlaceholder('Search videos and events')).toHaveValue(
    'ffmpeg or rgpd',
  );
});
