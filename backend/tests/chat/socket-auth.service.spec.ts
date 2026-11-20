import { SocketAuthService } from 'src/chat/socket-auth.service';
import { oidcFixture } from '../auth/oidc.fixture';

describe('SocketAuthService validated token lifetime', () => {
  const oidc = oidcFixture();
  let service: SocketAuthService;
  const mode = process.env.KEYCLOAK_TOKEN_VALIDATION;
  beforeEach(() => {
    process.env.KEYCLOAK_TOKEN_VALIDATION = 'OFFLINE';
    service = new SocketAuthService(oidc.keycloak);
  });
  afterEach(() => {
    if (mode === undefined) delete process.env.KEYCLOAK_TOKEN_VALIDATION;
    else process.env.KEYCLOAK_TOKEN_VALIDATION = mode;
  });
  it('returns email and expiry from the validated token', async () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    await expect(
      service.identityFromToken(
        oidc.token({ email: 'alice@example.test', exp }),
      ),
    ).resolves.toEqual({ email: 'alice@example.test', expiresAt: exp * 1000 });
  });
  it.each([undefined, null, 'tomorrow', 0, -1])(
    'refuses missing/invalid expiry %s',
    async (exp) => {
      await expect(
        service.identityFromToken(
          oidc.token({ email: 'alice@example.test', exp }),
        ),
      ).resolves.toBeNull();
    },
  );
  it('rejects a forged signature despite valid-looking email and lifetime', async () => {
    const forged = oidcFixture().token({ email: 'alice@example.test' });
    await expect(service.identityFromToken(forged)).resolves.toBeNull();
  });
  it('reuses the ONLINE validation result and exposes its expiry', async () => {
    process.env.KEYCLOAK_TOKEN_VALIDATION = 'ONLINE';
    const exp = Math.floor(Date.now() / 1000) + 60;
    const validate = jest
      .spyOn(oidc.keycloak.grantManager, 'validateAccessToken')
      .mockImplementation(async (token) => token);
    try {
      await expect(
        service.identityFromToken(
          oidc.token({ email: 'alice@example.test', exp }),
        ),
      ).resolves.toEqual({
        email: 'alice@example.test',
        expiresAt: exp * 1000,
      });
      expect(validate).toHaveBeenCalledTimes(1);
    } finally {
      validate.mockRestore();
    }
  });
});
