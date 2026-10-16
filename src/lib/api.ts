// Talks to the app's own server (POST /api/chat). The model is never called from the browser.
import type { ChatError, ChatRequest, ChatResponse } from '../../shared/api.ts';
import type { ServerConfig } from '../../shared/models.ts';

export class ChatFailed extends Error {}

export async function sendChat(req: ChatRequest): Promise<ChatResponse> {
  let res: Response;
  try {
    res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
  } catch {
    throw new ChatFailed(
      "Couldn't reach the app's server. Check your connection and try again. If you've been away a while, your login may have expired: reload the page to sign in again.",
    );
  }

  let data: ChatResponse | ChatError | null = null;
  try {
    data = await res.json();
  } catch {
    // Not JSON: usually means /api isn't being served at all.
  }
  if (data && 'error' in data) throw new ChatFailed(data.error.message);
  if (!res.ok || !data) {
    throw new ChatFailed(
      res.status === 404 || res.status >= 500
        ? "The tutor's server isn't running. Start the app with `npm start` (or run `npx wrangler pages dev` next to `npm run dev`)."
        : `The server answered with an error (${res.status}).`,
    );
  }
  return data;
}

/** The server's default models and which keys exist, for the settings popup. Null if unreachable. */
export async function fetchServerConfig(): Promise<ServerConfig | null> {
  try {
    const res = await fetch('/api/config');
    return res.ok ? ((await res.json()) as ServerConfig) : null;
  } catch {
    return null;
  }
}
