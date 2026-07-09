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
