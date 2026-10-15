import { describe, expect, it } from 'vitest';
import { serverConfig } from './config.ts';

describe('serverConfig', () => {
  it('reports the default models and which keys exist, never the keys themselves', () => {
    const env = { OPENROUTER_API_KEY: 'sk-secret', TUTOR_MODEL: 'z-ai/glm-5.3', JUDGE_MODEL: 'z-ai/glm-5.3-flash' };
    const config = serverConfig(env);
    expect(config).toEqual({
      defaults: { tutor: 'z-ai/glm-5.3', judge: 'z-ai/glm-5.3-flash' },
      keys: { openrouter: true, typesafe: false },
    });
    expect(JSON.stringify(config)).not.toContain('sk-secret');
  });

  it('says null when no default is set', () => {
    expect(serverConfig({}).defaults).toEqual({ tutor: null, judge: null });
  });
});
