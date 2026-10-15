// GET /api/config: what the settings page needs to know about the server.
// Only model names and whether keys exist, never the keys themselves.
import type { ServerConfig } from '../shared/models.ts';
import type { JevEnv } from './jev.ts';
import type { Env } from './openrouter.ts';

export function serverConfig(env: Env & JevEnv): ServerConfig {
  return {
    defaults: { tutor: env.TUTOR_MODEL || null, judge: env.JUDGE_MODEL || null },
    keys: { openrouter: !!env.OPENROUTER_API_KEY, typesafe: !!env.TYPESAFE_API_KEY },
  };
}
