// Picks the judge from JUDGE_MODEL:
//   "typesafe:jev-latest"  → TypeSafe's Jev (needs TYPESAFE_API_KEY)
//   anything else, e.g. "z-ai/glm-5.3-flash" → that OpenRouter chat model
import { chatJudge, type Judge } from './judge.ts';
import { jevJudge, parseJevQuestions, type JevEnv } from './jev.ts';
import { complete, type Env } from './openrouter.ts';
import { JEV_QUESTIONS, JUDGE_SYSTEM } from './prompts.generated.ts';

export const TYPESAFE_PREFIX = 'typesafe:';

const jevQuestions = parseJevQuestions(JEV_QUESTIONS);

export function makeJudge(env: Env & JevEnv, judgeModel: string): Judge {
  if (judgeModel.startsWith(TYPESAFE_PREFIX)) {
    return jevJudge(env, judgeModel.slice(TYPESAFE_PREFIX.length) || 'jev-latest', jevQuestions);
  }
  return chatJudge((model, messages) => complete(env, model, messages), judgeModel, JUDGE_SYSTEM);
}
