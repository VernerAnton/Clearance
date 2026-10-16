// Who is this? When the app sits behind Cloudflare Access, every request carries a token
// signed by Cloudflare (the Cf-Access-Jwt-Assertion header) that says which email logged
// in. We check the signature against Cloudflare's published keys before trusting it.
// Without Access (or without these settings), nobody is logged in and sync stays off.

export interface AccessEnv {
  /** The Zero Trust team domain, e.g. "myteam.cloudflareaccess.com". */
  ACCESS_TEAM_DOMAIN?: string;
  /** The Access application's audience tag (AUD), from the app's settings in Zero Trust. */
  ACCESS_AUD?: string;
  /** Local testing only: pretend this email is logged in. Ignored unless the host is localhost. */
  DEV_USER_EMAIL?: string;
}

interface Jwk extends JsonWebKey {
  kid?: string;
}

const KEY_CACHE_MS = 60 * 60 * 1000;
let cachedKeys: { team: string; at: number; keys: Jwk[] } | null = null;

/** Cloudflare's public keys for the team, cached for an hour. */
async function teamKeys(team: string, fetcher: typeof fetch, now: number, refresh = false): Promise<Jwk[]> {
  if (!refresh && cachedKeys && cachedKeys.team === team && now - cachedKeys.at < KEY_CACHE_MS) return cachedKeys.keys;
  const res = await fetcher(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Couldn't load Access keys (${res.status}).`);
  const body = (await res.json()) as { keys?: Jwk[] };
  cachedKeys = { team, at: now, keys: body.keys ?? [] };
  return cachedKeys.keys;
}

/** For tests: forget the cached keys. */
export function resetAccessKeyCache(): void {
  cachedKeys = null;
}

function base64UrlBytes(part: string): Uint8Array<ArrayBuffer> {
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (part.length % 4)) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function decodePart(part: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(new TextDecoder().decode(base64UrlBytes(part)));
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

/**
 * Checks an Access token and returns the logged-in email, or null if the token is missing,
 * forged, expired, or for a different Access application.
 */
export async function verifyAccessToken(
  token: string,
  team: string,
  aud: string,
  options: { fetcher?: typeof fetch; now?: number } = {},
): Promise<string | null> {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now();
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const header = decodePart(parts[0]);
  const payload = decodePart(parts[1]);
  if (!header || !payload || header.alg !== 'RS256') return null;

  const seconds = now / 1000;
  if (typeof payload.exp !== 'number' || payload.exp < seconds) return null;
  if (typeof payload.nbf === 'number' && payload.nbf > seconds + 60) return null;
  if (payload.iss !== `https://${team}`) return null;
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(aud)) return null;
  if (typeof payload.email !== 'string' || !payload.email) return null;

  const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const signature = base64UrlBytes(parts[2]);
  const findKey = (keys: Jwk[]) => keys.find((k) => k.kid === header.kid);
  try {
    // Cloudflare rotates its keys: an unknown key ID means "fetch them again", once.
    const jwk = findKey(await teamKeys(team, fetcher, now)) ?? findKey(await teamKeys(team, fetcher, now, true));
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, data);
    return ok ? payload.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** The logged-in email for this request, or null. */
export async function accessEmail(request: Request, env: AccessEnv): Promise<string | null> {
  const { hostname } = new URL(request.url);
  if (env.DEV_USER_EMAIL && (hostname === 'localhost' || hostname === '127.0.0.1')) return env.DEV_USER_EMAIL.toLowerCase();
  const team = env.ACCESS_TEAM_DOMAIN?.trim();
  const aud = env.ACCESS_AUD?.trim();
  if (!team || !aud) return null;
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return null;
  return verifyAccessToken(token, team, aud);
}
