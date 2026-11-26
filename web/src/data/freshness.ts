/**
 * Is the page you are looking at the one that was deployed?
 *
 * This exists because of a real afternoon's work lost. A change went live,
 * was verified live — the heading was in the deployed bundle, the old one was
 * gone from it — and the head teacher still could not see it, twice over,
 * because the tab had been open since morning and a single-page app never
 * reloads itself. There was no way for either of us to tell from the screen
 * which version was running, so the only answer anyone could give was "try
 * reloading", which is not an answer.
 *
 * So the build stamps itself. index.html carries a <meta> naming the build,
 * the bundle is compiled with the same name in __BUILD__, and this compares
 * them: fetch the live index.html, read its stamp, and if it is not the one
 * running, say so and offer the reload. index.html is served no-cache, so the
 * answer is always the server's.
 *
 * NO TWIN. The phone is a different problem — it updates by installing an
 * APK, and Android tells the user that itself.
 */

/** The build this bundle was compiled as. Set in vite.config.ts. */
export const BUILD: string = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev';

/** Where the stamp lives, in index.html and nowhere else. */
export const STAMP = 'schooltrack-build';

/**
 * The build named by a page's HTML, or null if it names none.
 *
 * Deliberately a regex over the text rather than a DOM parse: the answer is
 * one attribute, the input is the server's own index.html, and parsing a
 * whole document to read it invites the browser to fetch what it references.
 */
export function buildFromHtml(html: string): string | null {
  const meta = new RegExp(
    `<meta[^>]*name=["']${STAMP}["'][^>]*content=["']([^"']*)["']`,
    'i',
  ).exec(html);
  return meta ? meta[1] : null;
}

/**
 * Whether the page should be reloaded.
 *
 * False when the live build cannot be read at all: a school on a thin
 * connection loses the check before it loses the app, and a nag shown because
 * a fetch failed teaches people to ignore the one that matters. False too for
 * a dev build, which is whatever the dev server last handed over.
 */
export function isStale(running: string, live: string | null): boolean {
  if (live === null || live === '' || running === 'dev') return false;
  return live !== running;
}

/** The live build, or null if it could not be asked for. */
export async function liveBuild(fetcher: typeof fetch = fetch): Promise<string | null> {
  try {
    // Its own cache-buster as well as no-store: a proxy between the school
    // and Firebase is exactly the thing this is trying to see past.
    const res = await fetcher(`/?stamp=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return buildFromHtml(await res.text());
  } catch {
    return null;
  }
}
