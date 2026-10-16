import { beforeEach, describe, expect, it } from 'vitest';
import { accessEmail, resetAccessKeyCache, verifyAccessToken } from './access.ts';

const TEAM = 'team.cloudflareaccess.com';
const AUD = 'aud-123';
const NOW = Date.UTC(2026, 9, 16);

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = (obj: unknown) => b64url(new TextEncoder().encode(JSON.stringify(obj)));

async function keyPair() {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1' };
  return { privateKey: pair.privateKey, jwk };
}

async function sign(privateKey: CryptoKey, payload: Record<string, unknown>, kid = 'k1') {
  const head = enc({ alg: 'RS256', kid });
  const body = enc(payload);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(new Uint8Array(sig))}`;
}

const good = { email: 'Learner@Example.com', aud: [AUD], iss: `https://${TEAM}`, exp: NOW / 1000 + 3600, nbf: NOW / 1000 - 10 };

describe('verifyAccessToken', () => {
  let keys: Awaited<ReturnType<typeof keyPair>>;
  let fetcher: typeof fetch;
  let certFetches = 0;
  beforeEach(async () => {
    resetAccessKeyCache();
    keys = await keyPair();
    certFetches = 0;
    fetcher = (async (url: string) => {
      certFetches++;
      expect(url).toBe(`https://${TEAM}/cdn-cgi/access/certs`);
      return Response.json({ keys: [keys.jwk] });
    }) as typeof fetch;
  });

  it('returns the email (lower-cased) for a valid token, and caches the keys', async () => {
    const token = await sign(keys.privateKey, good);
    expect(await verifyAccessToken(token, TEAM, AUD, { fetcher, now: NOW })).toBe('learner@example.com');
    expect(await verifyAccessToken(token, TEAM, AUD, { fetcher, now: NOW })).toBe('learner@example.com');
    expect(certFetches).toBe(1);
  });

  it('rejects expired tokens, other apps, other teams and missing emails', async () => {
    const check = async (over: Record<string, unknown>) =>
      verifyAccessToken(await sign(keys.privateKey, { ...good, ...over }), TEAM, AUD, { fetcher, now: NOW });
    expect(await check({ exp: NOW / 1000 - 1 })).toBeNull();
    expect(await check({ aud: ['someone-else'] })).toBeNull();
    expect(await check({ iss: 'https://evil.cloudflareaccess.com' })).toBeNull();
    expect(await check({ email: '' })).toBeNull();
  });

  it('rejects a token signed with a different key, and garbage', async () => {
    const other = await keyPair();
    expect(await verifyAccessToken(await sign(other.privateKey, good), TEAM, AUD, { fetcher, now: NOW })).toBeNull();
    const token = await sign(keys.privateKey, good);
    const [h, , s] = token.split('.');
    expect(await verifyAccessToken(`${h}.${enc({ ...good, email: 'boss@example.com' })}.${s}`, TEAM, AUD, { fetcher, now: NOW })).toBeNull();
    expect(await verifyAccessToken('not.a.token', TEAM, AUD, { fetcher, now: NOW })).toBeNull();
  });
});

describe('accessEmail', () => {
  it('is null without Access settings or a token', async () => {
    const req = new Request('https://clearance.example.workers.dev/api/sync');
    expect(await accessEmail(req, {})).toBeNull();
    expect(await accessEmail(req, { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD })).toBeNull();
  });

  it('uses DEV_USER_EMAIL on localhost only', async () => {
    const env = { DEV_USER_EMAIL: 'me@example.com' };
    expect(await accessEmail(new Request('http://localhost:8788/api/sync'), env)).toBe('me@example.com');
    expect(await accessEmail(new Request('https://clearance.example.workers.dev/api/sync'), env)).toBeNull();
  });
});
