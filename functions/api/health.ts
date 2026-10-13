// GET /api/health: a tiny check that Pages Functions are running.
export const onRequestGet = () => Response.json({ ok: true });
