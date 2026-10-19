import { Inject, Injectable, Logger } from '@nestjs/common';
import { KEYCLOAK_INSTANCE } from 'nest-keycloak-connect';

// Checks the Keycloak access token a chat client sends when it connects (socket.io
// "auth.token"), the same way the HTTP guard checks the Authorization header.
@Injectable()
export class SocketAuthService {
  private readonly logger = new Logger(SocketAuthService.name);

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @Inject(KEYCLOAK_INSTANCE) private readonly keycloak: any,
  ) {}

  // The token's e-mail when the token is valid, null otherwise.
  async emailFromToken(jwt?: string): Promise<string | null> {
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
      return token.content?.email ?? null;
    } catch (err) {
      this.logger.verbose(`Chat token refused: ${err}`);
      return null;
    }
  }
}
