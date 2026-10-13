import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { selfHostPyodide } from './scripts/vite-plugin-pyodide.ts';

// Same headers as public/_headers (which Cloudflare uses), so `npm run dev`
// behaves like the real site: cross-origin isolated, so input() works.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [react(), selfHostPyodide()],
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  worker: { format: 'es' },
});
