import { Inject, Injectable, Logger } from '@nestjs/common';
import { KEYCLOAK_INSTANCE } from 'nest-keycloak-connect';

export interface SocketIdentity {
  email: string;
  expiresAt: number;
}

// Checks the Keycloak access token a chat client sends when it connects (socket.io
// "auth.token"), the same way the HTTP guard checks the Authorization header.
@Injectable()
export class SocketAuthService {
  private readonly logger = new Logger(SocketAuthService.name);

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @Inject(KEYCLOAK_INSTANCE) private readonly keycloak: any,
  ) {}

  // Retain the verified lifetime, so writes need no per-message introspection.
  async identityFromToken(jwt?: string): Promise<SocketIdentity | null> {
    if (!jwt) return null;
    try {
      const gm = this.keycloak.grantManager;
      const grant = await gm.createGrant({ access_token: jwt });
      const token = grant.access_token;
      const mode = (
        process.env.KEYCLOAK_TOKEN_VALIDATION || 'ONLINE'
      ).toUpperCase();
      if (mode === 'OFFLINE') {
        if ((await gm.validateToken(token, 'Bearer')) !== token) return null;
      } else if (mode !== 'NONE') {
        if ((await gm.validateAccessToken(token)) !== token) return null;
      }
      const { email, exp } = token.content ?? {};
      if (
        typeof email !== 'string' ||
        !email ||
        typeof exp !== 'number' ||
        !Number.isFinite(exp) ||
        exp * 1000 <= Date.now()
      )
        return null;
      return { email, expiresAt: exp * 1000 };
    } catch (err) {
      this.logger.verbose(`Chat token refused: ${err}`);
      return null;
    }
  }
}
