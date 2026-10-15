// The Cloudflare Worker: answers /api/* and serves the built site (dist/) for everything else.
import { handleChat } from './chat.ts';
import { serverConfig } from './config.ts';
import type { JevEnv } from './jev.ts';
import type { Env } from './openrouter.ts';

interface WorkerEnv extends Env, JevEnv {
  /** The built site, uploaded with the Worker (see [assets] in wrangler.toml). */
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/chat') {
      if (request.method !== 'POST') return new Response('Use POST', { status: 405, headers: { Allow: 'POST' } });
      return handleChat(request, env);
    }
    if (pathname === '/api/health') return Response.json({ ok: true });
    if (pathname === '/api/config') return Response.json(serverConfig(env));
    if (pathname.startsWith('/api/')) return Response.json({ error: { kind: 'bad-request', message: 'Unknown API path.' } }, { status: 404 });
    return env.ASSETS.fetch(request);
  },
};
