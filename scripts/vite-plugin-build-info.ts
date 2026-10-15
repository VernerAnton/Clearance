// Build details for the version stamp, and the key to update detection.
// - Puts the commit and build time into the app (__BUILD_COMMIT__, __BUILD_TIME__).
// - Stamps the same build ID into dist/sw.js. Browsers only notice a new version
//   when the service worker file's bytes change, and ours is otherwise identical
//   in every build, so without this stamp the "newer version" prompt never fires.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';

const PLACEHOLDER = '__BUILD_ID__';

function commitSha(): string {
  // Cloudflare's build sets this; elsewhere ask git. A cosmetic label must never fail a build.
  const fromCi = process.env.WORKERS_CI_COMMIT_SHA;
  if (fromCi) return fromCi.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev';
  } catch {
    return 'dev';
  }
}

export function buildInfo(): Plugin {
  const commit = commitSha();
  const now = new Date();
  // Short enough to fit on one line in the left rail, e.g. "15 Oct 18:25 UTC".
  const month = now.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
  const time = `${now.getUTCDate()} ${month} ${now.toISOString().slice(11, 16)} UTC`;
  // Unique per build, even two builds of the same commit in the same minute.
  const buildId = `${commit}-${now.toISOString()}`;
  let outDir = 'dist';
  return {
    name: 'build-info',
    config: () => ({
      define: { __BUILD_COMMIT__: JSON.stringify(commit), __BUILD_TIME__: JSON.stringify(time) },
    }),
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const sw = join(outDir, 'sw.js');
      if (!existsSync(sw)) return;
      const text = readFileSync(sw, 'utf8');
      if (!text.includes(PLACEHOLDER)) throw new Error(`dist/sw.js has no ${PLACEHOLDER} to stamp; update detection would silently never fire.`);
      writeFileSync(sw, text.replaceAll(PLACEHOLDER, buildId));
    },
  };
}
