// GET /api/health: a tiny check that Pages Functions are running.
// The real tutor endpoint (/api/chat) arrives in Phase 4.
export const onRequestGet = () => Response.json({ ok: true });
