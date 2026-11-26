/**
 * The build's own name, compiled in by vite.config.ts and compared against
 * the one in index.html. See src/data/freshness.ts.
 *
 * Declared rather than imported because it is not a module: Vite replaces the
 * identifier at build time, and under vitest — where nothing replaces it — the
 * reader falls back to 'dev', which is what a dev build should call itself.
 */
declare const __BUILD__: string | undefined;
