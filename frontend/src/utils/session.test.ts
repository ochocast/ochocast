import { renewSession, storeSessionToken } from './session';

const stored = () => JSON.parse(localStorage.getItem('backendUser') || 'null');

beforeEach(() => {
  localStorage.clear();
});

describe('storeSessionToken', () => {
  it('replaces the token of the stored backend user, keeping the rest', () => {
    localStorage.setItem(
      'backendUser',
      JSON.stringify({ id: 'u1', role: 'admin', token: 'old' }),
    );
    storeSessionToken('fresh');
    expect(stored()).toEqual({ id: 'u1', role: 'admin', token: 'fresh' });
  });

  it('creates no user when nobody is logged in', () => {
    storeSessionToken('fresh');
    expect(localStorage.getItem('backendUser')).toBeNull();
  });

  it.each(['{not json', 'null', '"text"'])(
    'leaves a corrupt entry (%s) as it is',
    (entry) => {
      localStorage.setItem('backendUser', entry);
      expect(() => storeSessionToken('fresh')).not.toThrow();
      expect(localStorage.getItem('backendUser')).toBe(entry);
    },
  );
});

describe('renewSession', () => {
  beforeEach(() => {
    localStorage.setItem(
      'backendUser',
      JSON.stringify({ id: 'u1', token: 'old' }),
    );
  });

  it('stores the renewed token and reports success', async () => {
    const signinSilent = jest.fn().mockResolvedValue({ access_token: 'fresh' });
    await expect(renewSession(signinSilent)).resolves.toBe(true);
    expect(signinSilent).toHaveBeenCalledTimes(1);
    expect(stored().token).toBe('fresh');
  });

  it.each([
    ['no user', undefined],
    ['a null user', null],
    ['a user without a token', {}],
    ['an empty token', { access_token: '' }],
  ])('fails without touching the token on %s', async (_case, user) => {
    await expect(renewSession(() => Promise.resolve(user))).resolves.toBe(
      false,
    );
    expect(stored().token).toBe('old');
  });

  it('fails without throwing when the silent sign-in is refused', async () => {
    const signinSilent = jest
      .fn()
      .mockRejectedValue(new Error('login_required'));
    await expect(renewSession(signinSilent)).resolves.toBe(false);
    expect(stored().token).toBe('old');
  });
});
