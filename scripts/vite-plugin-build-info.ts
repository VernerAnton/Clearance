// Build details for the version stamp, and the key to update detection.
// - Puts the commit, build time and a unique build ID into the app (__BUILD_COMMIT__,
//   __BUILD_TIME__, __BUILD_ID__).
// - Writes dist/version.json with the same build ID (and APP_VERSION). The app compares
//   its own build ID with this file's: different means a newer build is deployed.
// - Stamps the build ID into dist/sw.js. Browsers only update a service worker when its
//   file's bytes change, and ours is otherwise identical in every build, so without the
//   stamp the offline copy would never pick up new code.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const PLACEHOLDER = '__BUILD_ID__';

/** APP_VERSION from src/version.ts, for version.json (so the prompt can say which version is waiting). */
function appVersion(): number | null {
  const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'version.ts');
  const match = readFileSync(file, 'utf8').match(/APP_VERSION = (\d+);/);
  return match ? Number(match[1]) : null;
}

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
      define: {
        __BUILD_COMMIT__: JSON.stringify(commit),
        __BUILD_TIME__: JSON.stringify(time),
        __BUILD_ID__: JSON.stringify(buildId),
      },
    }),
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      writeFileSync(join(outDir, 'version.json'), JSON.stringify({ build: buildId, version: appVersion() }) + '\n');
      const sw = join(outDir, 'sw.js');
      if (!existsSync(sw)) return;
      const text = readFileSync(sw, 'utf8');
      if (!text.includes(PLACEHOLDER)) throw new Error(`dist/sw.js has no ${PLACEHOLDER} to stamp; update detection would silently never fire.`);
      writeFileSync(sw, text.replaceAll(PLACEHOLDER, buildId));
    },
  };
}
