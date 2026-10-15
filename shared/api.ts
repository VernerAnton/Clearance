// The shape of POST /api/chat, shared by the browser and the server.
import type { ModeId } from './clearance.ts';

export type Lang = 'python' | 'sql';

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  mode: ModeId;
  level: number;
  message: string;
  /** The chat since the last "New mission", without context headers. */
  history: HistoryMessage[];
  activeTab: { title: string; lang: Lang; code: string; fromMission: boolean };
  lastRun: { output: string; endedWithError: boolean } | null;
  /** Models picked in Settings. Empty or missing means the server's default. */
  models?: { tutor?: string; judge?: string };
  /** How hard the tutor thinks before answering (Settings). Missing means low. */
  thinking?: Thinking;
}

export type Thinking = 'low' | 'medium' | 'high';
export const THINKING_LEVELS: Thinking[] = ['low', 'medium', 'high'];

/** A draft the guard blocked before the learner saw it. */
export interface Intercepted {
  attempt: number;
  step: 'code-check' | 'judge';
  why: string;
  draft: string;
}

export interface Mission {
  title: string;
  lang: Lang;
  code: string;
}

export interface JudgeCheck {
  attempt: number;
  messages: { role: string; content: string }[];
  /** The judge's raw answer, and how it was read. */
  raw: string;
  verdict: { leaks: boolean; why: string; parsed: boolean };
}

export interface ChatResponse {
  reply: string;
  attempts: number;
  intercepted: Intercepted[];
  /** True when every draft failed and the reply is the app's fixed message. */
  fallback: boolean;
  /** New exercises to open in tabs (Challenge mode), at most LIMITS.missions. */
  missions: Mission[];
  /** Missions the tutor wrote beyond the limit, which were left out. */
  missionsSkipped: number;
  /** For the "What the tutor receives" panel. */
  debug: {
    tutorMessages: { role: string; content: string }[];
    judgeChecks: JudgeCheck[];
    /** Which models were used (judge is null when it wasn't needed). */
    models?: { tutor: string; judge: string | null };
  };
}

export interface ChatError {
  error: { kind: 'bad-request' | 'config' | 'upstream' | 'rate-limit' | 'credits' | 'auth'; message: string };
}

/** Limits the server enforces on a request. */
export const LIMITS = {
  message: 8_000,
  code: 30_000,
  output: 1_500,
  historyMessages: 30,
  historyContent: 12_000,
  title: 200,
  /** Missions opened from one reply. Also stated in prompts/tutor-system.md. */
  missions: 10,
};
