import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The build's own name, put in two places that must agree: compiled into the
 * bundle as __BUILD__, and written into index.html as a <meta>. The running
 * app compares the two to know whether it is the one deployed — see
 * src/data/freshness.ts, and the afternoon described at the top of it.
 *
 * The commit, so it can be looked up, and the minute, so two builds of the
 * same commit are still different builds. Falls back to the time alone
 * outside a checkout, where there is no commit to name.
 */
const buildId = (() => {
  const when = new Date().toISOString().slice(0, 16).replace('T', ' ');
  try {
    const sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
    return sha ? `${sha} ${when}` : when;
  } catch {
    return when;
  }
})();

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'build-stamp',
      transformIndexHtml: (html: string) => html.replace(
        '</head>',
        `  <meta name="schooltrack-build" content="${buildId}">\n  </head>`,
      ),
    },
  ],
  define: { __BUILD__: JSON.stringify(buildId) },
  server: { port: 5173 },
  build: { outDir: 'dist', sourcemap: true },
});
