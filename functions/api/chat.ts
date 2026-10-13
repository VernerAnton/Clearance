// POST /api/chat: one tutor message. The work happens in server/chat.ts.
import { handleChat } from '../../server/chat.ts';
import type { Env } from '../../server/openrouter.ts';

export const onRequestPost = ({ request, env }: { request: Request; env: Env }) => handleChat(request, env);
