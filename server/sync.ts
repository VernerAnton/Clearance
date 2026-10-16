// GET/PUT /api/sync: your tabs and settings, saved in a D1 database under your Access email.
import { accessEmail, type AccessEnv } from './access.ts';
import { SYNC_LIMITS, isSyncData, type SyncData, type SyncPutResult, type SyncState } from '../shared/sync.ts';

/** The bits of Cloudflare's D1 database API used here. */
export interface D1Like {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T>(): Promise<T | null>;
      run(): Promise<{ meta: { changes: number } }>;
    };
    run(): Promise<unknown>;
  };
}

export interface SyncEnv extends AccessEnv {
  /** The "clearance" D1 database (see [[d1_databases]] in wrangler.toml). */
  DB?: D1Like;
}

let tableReady = false;
async function ensureTable(db: D1Like) {
  if (tableReady) return;
  await db
    .prepare(
      'CREATE TABLE IF NOT EXISTS user_data (email TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL)',
    )
    .run();
  tableReady = true;
}

async function current(db: D1Like, email: string): Promise<{ version: number; data: SyncData | null }> {
  const row = await db.prepare('SELECT version, data FROM user_data WHERE email = ?').bind(email).first<{ version: number; data: string }>();
  if (!row) return { version: 0, data: null };
  try {
    const data = JSON.parse(row.data);
    return { version: row.version, data: isSyncData(data) ? data : null };
  } catch {
    return { version: row.version, data: null };
  }
}

const fail = (status: number, message: string) => Response.json({ error: { kind: 'bad-request', message } }, { status });

export async function handleSync(request: Request, env: SyncEnv): Promise<Response> {
  if (!env.DB) return Response.json({ enabled: false, reason: 'no-database' } satisfies SyncState);
  const email = await accessEmail(request, env);
  if (!email) return Response.json({ enabled: false, reason: 'not-logged-in' } satisfies SyncState);
  const db = env.DB;
  await ensureTable(db);

  if (request.method === 'GET') {
    const { version, data } = await current(db, email);
    return Response.json({ enabled: true, email, version, data } satisfies SyncState, { headers: { 'Cache-Control': 'no-store' } });
  }

  if (request.method !== 'PUT') return new Response('Use GET or PUT', { status: 405, headers: { Allow: 'GET, PUT' } });
  const text = await request.text();
  if (text.length > SYNC_LIMITS.bytes) return fail(413, 'Too much to save: close some tabs.');
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return fail(400, 'The sync data is not valid JSON.');
  }
  const { baseVersion, data } = (body ?? {}) as Record<string, unknown>;
  if (typeof baseVersion !== 'number' || !Number.isInteger(baseVersion) || baseVersion < 0 || !isSyncData(data)) {
    return fail(400, 'The sync data has the wrong shape.');
  }

  // Save only if nobody saved since this device last looked (optimistic locking): otherwise
  // answer 409 with what's there, and the device merges and tries again.
  const json = JSON.stringify(data);
  const now = Date.now();
  const result =
    baseVersion === 0
      ? await db
          .prepare('INSERT INTO user_data (email, version, data, updated_at) VALUES (?, 1, ?, ?) ON CONFLICT(email) DO NOTHING')
          .bind(email, json, now)
          .run()
      : await db
          .prepare('UPDATE user_data SET version = version + 1, data = ?, updated_at = ? WHERE email = ? AND version = ?')
          .bind(json, now, email, baseVersion)
          .run();
  if (result.meta.changes === 0) {
    const { version, data: theirs } = await current(db, email);
    return Response.json({ ok: false, conflict: true, version, data: theirs } satisfies SyncPutResult, { status: 409 });
  }
  return Response.json({ ok: true, version: baseVersion + 1 } satisfies SyncPutResult);
}
