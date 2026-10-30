import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import type { Page, APIRequestContext } from '@playwright/test';
import { test, expect, getAccessToken } from '../fixtures';

const apiUrl = process.env.PLAYWRIGHT_API_URL || 'http://localhost:3001/api';

// Real MP4, longer than the one-second thumbnail seek. No mislabeled WebM.
async function createVideo(speech = false) {
  if (!speech) return readFile(path.resolve('e2e/assets/video-short.mp4'));
  const directory = await mkdtemp(path.join(tmpdir(), 'ochocast-subtitles-e2e-'));
  try {
    const file = path.join(directory, 'video.mp4');
    const args = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=320x180:r=10'];
    if (speech) args.push('-i', path.resolve('e2e/assets/speech-fr.wav'));
    args.push('-t', speech ? '12' : '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p');
    if (speech) args.push('-c:a', 'aac');
    args.push(file);
    await promisify(execFile)(process.env.FFMPEG_PATH || 'ffmpeg', args);
    return await readFile(file);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function publish(page: Page, trackVideo: (id: string) => void,
  subtitle?: { name: string; mimeType: string; buffer: Buffer }) {
  await page.addInitScript(() => localStorage.setItem('lang', 'en'));
  await page.goto('/video/video-settings');
  await page.getByPlaceholder('Title').fill('E2E subtitles ' + Date.now());
  await page.getByPlaceholder('Description').fill('E2E subtitle description');
  await page.getByLabel('Slide or choose your media').setInputFiles({
    name: 'e2e-subtitles.mp4', mimeType: 'video/mp4', buffer: await createVideo(!subtitle),
  });
  if (subtitle) await page.getByLabel('Drag or choose your subtitle file').setInputFiles(subtitle);
  const completion = page.waitForResponse((response) =>
    response.url().includes('/video-uploads/') && response.url().endsWith('/complete') &&
    response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Publish video' }).click();
  const response = await completion;
  expect(response.ok()).toBeTruthy();
  const { id } = await response.json();
  expect(id).toMatch(/^[0-9a-f-]{36}$/i);
  trackVideo(id);
  return id as string;
}

async function readSubtitle(page: Page, request: APIRequestContext, id: string) {
  const headers = { Authorization: 'Bearer ' + await getAccessToken(page) };
  const response = await request.get(apiUrl + '/videos/subtitle/' + id, { headers });
  expect(response.ok()).toBeTruthy();
  const url = await response.text();
  expect(typeof url).toBe('string');
  const stored = await request.get(url);
  expect(stored.ok()).toBeTruthy();
  return stored.text();
}

async function expectPlayerTrack(page: Page, id: string) {
  await page.goto('/video/' + id);
  const track = page.locator('video track[kind="subtitles"]');
  await expect(track).toHaveCount(1);
  await expect(track).toHaveAttribute('label', 'Français');
  await expect.poll(() => page.locator('video').evaluate((video) => {
    const textTrack = (video as HTMLVideoElement).textTracks[0];
    // Disabled tracks are not downloaded by the browser until selected.
    if (textTrack) textTrack.mode = 'showing';
    return textTrack?.cues?.length || 0;
  }), { timeout: 15_000 }).toBeGreaterThan(0);
}

for (const format of ['srt', 'vtt'] as const) {
  test('uploads ' + format.toUpperCase() + ' and displays a readable WebVTT track', async ({ page, request, trackVideo }) => {
    test.setTimeout(180_000);
    const text = 'Sous-titre E2E chargé';
    const content = format === 'srt'
      ? '1\n00:00:00,000 --> 00:00:02,800\n' + text + '\n'
      : 'WEBVTT\n\n00:00:00.000 --> 00:00:02.800\n' + text + '\n';
    const id = await publish(page, trackVideo, { name: 'subtitles.' + format,
      mimeType: format === 'srt' ? 'application/x-subrip' : 'text/vtt', buffer: Buffer.from(content) });
    const headers = { Authorization: 'Bearer ' + await getAccessToken(page) };
    await expect.poll(async () => {
      const response = await request.get(apiUrl + '/videos?id=' + id, { headers });
      if (!response.ok()) return 'http-' + response.status();
      return (await response.json())[0]?.transcoding_status;
    }, { timeout: 120_000, intervals: [1000, 2000, 5000] }).toBe('ready');
    const vtt = await readSubtitle(page, request, id);
    expect(vtt).toContain('WEBVTT');
    expect(vtt).toContain('00:00:00.000 --> 00:00:02.800');
    expect(vtt).toContain(text);
    await expectPlayerTrack(page, id);
  });
}

test('automatically transcribes an upload without a supplied subtitle', async ({ page, request, trackVideo }) => {
  test.skip(process.env.E2E_AUTOMATIC_SUBTITLES !== '1',
    'Requires a local transcription stack and a short transcription cron; see docs/AUTOMATIC_SUBTITLES.md');
  test.setTimeout(300_000);
  const id = await publish(page, trackVideo);
  const headers = { Authorization: 'Bearer ' + await getAccessToken(page) };
  await expect.poll(async () => {
    const response = await request.get(apiUrl + '/videos?id=' + id, { headers });
    if (!response.ok()) return 'http-' + response.status();
    return (await response.json())[0]?.transcription_status;
  }, { timeout: 240_000, intervals: [1000, 2000, 5000] }).toBe('ready');
  expect((await readSubtitle(page, request, id)).toLowerCase()).toContain('bonjour');
  await expectPlayerTrack(page, id);
});
