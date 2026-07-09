import { test, expect } from '@playwright/test';

test('verify automatic login and homepage access', async ({ page }) => {
  // 1. Naviguer vers la page d'accueil
  await page.goto('/');

  // 2. Vérifier que nous ne sommes pas redirigés vers Keycloak
  await expect(page).not.toHaveURL(/.*localhost:8080.*/);

  // 3. Vérifier la présence d'éléments clés sur l'interface (ex: barre de recherche, liens)
  // Nous cherchons des éléments de navigation typiques présents sur la page d'accueil d'Ochocast
  const body = page.locator('body');

  // Attendre que l'application soit chargée (par exemple le texte "Vidéos" ou "Streaming" issu de la navigation du Header)
  await expect(body).toBeVisible();

  // Vérifier qu'il y a un champ de recherche
  const searchBar = page.locator('input[type="text"], input[placeholder*="recherche"]');
  await expect(searchBar.first()).toBeVisible();
});

test('create event and check it has been created', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create Event' }).click();
  await page.getByRole('textbox', { name: 'My Event' }).click();
  await page.getByRole('textbox', { name: 'My Event' }).fill('E2E Event');
  await page.getByRole('textbox', { name: 'Description...' }).click();
  await page.getByRole('textbox', { name: 'Description...' }).fill('E2E Event description');
  await page.locator('input[type="date"]').fill('2050-10-10');
  await page.getByRole('textbox').nth(4).fill('19:00');
  await page.getByRole('textbox').nth(5).fill('23:00');
  await page.getByRole('textbox', { name: 'Tags' }).click();
  await page.getByRole('textbox', { name: 'Tags' }).fill('coolTag');
  await page.getByRole('button', { name: '+' }).click();
  await page.getByRole('button', { name: 'Create Event' }).click();
  await expect(page.getByRole('img', { name: 'E2E Event' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'E2E Event' })).toBeVisible();
  await expect(page.getByText('Test User')).toBeVisible();
  await expect(page.getByText('10/10/')).toBeVisible();
  await expect(page.getByText('coolTag').first()).toBeVisible();
  await page.getByRole('img', { name: 'OchoCast logo' }).click();
  await expect(page.getByText('0 eventsNo events published')).toBeVisible();
  await page.getByRole('img', { name: 'test-user\'s profile' }).click();
  await page.locator('div').filter({ hasText: /^My events$/ }).click();
  await page.getByRole('button', { name: 'Publish' }).click();
  await page.getByRole('img', { name: 'OchoCast logo' }).click();
  await expect(page.getByRole('heading', { name: 'E2E Event' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Modifier' })).toBeVisible();
});