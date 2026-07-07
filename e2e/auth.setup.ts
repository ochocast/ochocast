import { test as setup } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page }) => {
  // 1. Naviguer vers l'application
  await page.goto('/');

  // 2. Attendre la redirection vers le serveur Keycloak
  // Le serveur Keycloak local tourne par défaut sur le port 8080 (realm local-realm)
  await page.waitForURL(/.*localhost:8080.*/);

  // 3. Remplir le formulaire Keycloak
  // Les sélecteurs ci-dessous sont les sélecteurs standard de la page de login Keycloak
  const usernameInput = page.locator('#username');
  const passwordInput = page.locator('#password');
  const loginButton = page.locator('#kc-login');

  // Récupérer les identifiants de test depuis l'environnement ou utiliser des valeurs par défaut
  const testUser = process.env.PLAYWRIGHT_TEST_USER || 'test-user';
  const testPassword = process.env.PLAYWRIGHT_TEST_PASSWORD || 'test-password';

  await usernameInput.fill(testUser);
  await passwordInput.fill(testPassword);
  
  // 4. Soumettre le formulaire
  await loginButton.click();

  // 5. Attendre d'être redirigé à nouveau vers l'application principale
  await page.waitForURL('http://localhost:3000/**');

  // 6. Sauvegarder l'état d'authentification pour les autres tests
  await page.context().storageState({ path: authFile });
});
