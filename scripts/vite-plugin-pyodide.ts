// Serves Pyodide (Python for the browser) from this site instead of a CDN.
// - `npm run dev`: answers /pyodide/* straight from node_modules/pyodide, before
//   Vite's own handling (which would try to process the .mjs files and fail).
// - `npm run build`: copies the same files into dist/pyodide/.
import { copyFileSync, createReadStream, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';

const SOURCE = resolve(import.meta.dirname, '..', 'node_modules', 'pyodide');

/** The files Pyodide needs at runtime, and the type to serve each with. */
const FILES: Record<string, string> = {
  'pyodide.mjs': 'text/javascript',
  'pyodide.asm.mjs': 'text/javascript',
  'pyodide.asm.wasm': 'application/wasm',
  'python_stdlib.zip': 'application/zip',
  'pyodide-lock.json': 'application/json',
};

export function selfHostPyodide(): Plugin {
  let outDir = 'dist';
  return {
    name: 'self-host-pyodide',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.match(/^\/pyodide\/([^?#]+)/)?.[1];
        if (!name || !(name in FILES)) return next();
        res.setHeader('Content-Type', FILES[name]);
        createReadStream(join(SOURCE, name)).pipe(res);
      });
    },
    closeBundle() {
      mkdirSync(join(outDir, 'pyodide'), { recursive: true });
      for (const name of Object.keys(FILES)) copyFileSync(join(SOURCE, name), join(outDir, 'pyodide', name));
    },
  };
}
