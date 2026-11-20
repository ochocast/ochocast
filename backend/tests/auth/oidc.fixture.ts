import { generateKeyPairSync, sign } from 'node:crypto';
import * as Keycloak from 'keycloak-connect';

// Ephemeral signing key: exercises the real Keycloak signature/expiry validator
// without an external realm or credentials.
export function oidcFixture() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const config = {
    realm: 'test',
    'confidential-port': 0,
    'ssl-required': 'none',
    'auth-server-url': 'http://oidc.invalid',
    resource: 'backend',
    'realm-public-key': publicKey
      .export({ type: 'spki', format: 'pem' })
      .toString()
      .replace(/-----[^\n]+-----|\s/g, ''),
  };
  const keycloak = new Keycloak({}, config);
  const token = (claims: Record<string, unknown> = {}) => {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(
      JSON.stringify({ alg: 'RS256', typ: 'JWT' }),
    ).toString('base64url');
    const body = Buffer.from(
      JSON.stringify({
        sub: 'signed-user',
        iss: 'http://oidc.invalid/realms/test',
        typ: 'Bearer',
        iat: now,
        exp: now + 300,
        ...claims,
      }),
    ).toString('base64url');
    const unsigned = `${header}.${body}`;
    return `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url')}`;
  };
  return { keycloak, token };
}
