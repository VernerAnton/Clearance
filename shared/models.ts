// The models the settings can pick from. The server only accepts these, so a
// visitor can't make the app call any model they like on your OpenRouter key.
// Prices are OpenRouter's, per million tokens (input / output), October 2026.

export interface ModelOption {
  id: string;
  label: string;
  note: string;
}

export const TUTOR_MODELS: ModelOption[] = [
  { id: 'z-ai/glm-5.3', label: 'GLM 5.3', note: 'Z.ai, strong reasoning · $0.08 / $4.80' },
  { id: 'minimax/minimax-m3', label: 'MiniMax M3', note: 'MiniMax · $0.30 / $1.20' },
  { id: 'z-ai/glm-5.3-flashx', label: 'GLM 5.3 FlashX', note: 'Z.ai, fastest · $0.37 / $1.25' },
  { id: 'z-ai/glm-5.3-flash', label: 'GLM 5.3 Flash', note: 'Z.ai, cheapest · $0.04 / $0.90' },
];

export const JUDGE_MODELS: ModelOption[] = [
  { id: 'z-ai/glm-5.3-flash', label: 'GLM 5.3 Flash', note: 'Z.ai, cheapest · $0.04 / $0.90' },
  { id: 'z-ai/glm-5.3-flashx', label: 'GLM 5.3 FlashX', note: 'Z.ai, fastest · $0.37 / $1.25' },
  { id: 'minimax/minimax-m3', label: 'MiniMax M3', note: 'MiniMax · $0.30 / $1.20' },
  { id: 'z-ai/glm-5.3', label: 'GLM 5.3', note: 'Z.ai, strong reasoning · $0.08 / $4.80' },
  { id: 'typesafe:jev-latest', label: 'Jev', note: 'TypeSafe, yes/no answers with probabilities · experimental' },
];

export const isTutorModel = (id: string) => TUTOR_MODELS.some((m) => m.id === id);
export const isJudgeModel = (id: string) => JUDGE_MODELS.some((m) => m.id === id);

/** What GET /api/config tells the page: the defaults set on the server, and which keys exist. */
export interface ServerConfig {
  defaults: { tutor: string | null; judge: string | null };
  keys: { openrouter: boolean; typesafe: boolean };
}
