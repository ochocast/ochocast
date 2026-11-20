// Every API request reads the token stored with the backend user (see the
// request transform in api.js): a renewed token replaces it there.
export function storeSessionToken(token: string): void {
  const userString = localStorage.getItem('backendUser');
  if (!userString) return;
  try {
    const user = JSON.parse(userString);
    if (!user || typeof user !== 'object') return;
    user.token = token;
    localStorage.setItem('backendUser', JSON.stringify(user));
  } catch {
    // A corrupt entry is left to the next login.
  }
}

export type SilentSignin = () => Promise<
  { access_token?: string } | null | undefined
>;

/**
 * Renews the Keycloak session without leaving the page (an expired access
 * token answers 401), then stores the new token for the next requests.
 * Never throws: false when no new token could be obtained.
 */
export async function renewSession(
  signinSilent: SilentSignin,
): Promise<boolean> {
  let user;
  try {
    user = await signinSilent();
  } catch {
    return false;
  }
  if (!user?.access_token) return false;
  storeSessionToken(user.access_token);
  return true;
}
