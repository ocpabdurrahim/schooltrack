import { describe, expect, it } from 'vitest';
import { buildFromHtml, isStale, liveBuild } from './freshness';

/** No twin: the phone updates by installing an APK. See freshness.ts. */

const page = (build: string) =>
  `<!doctype html><html><head><meta charset="utf-8">`
  + `<meta name="schooltrack-build" content="${build}">`
  + `<title>SchoolTrack</title></head><body></body></html>`;

describe('reading the build out of a page', () => {
  it('finds the stamp', () => {
    expect(buildFromHtml(page('bf92507 2026-11-26 09:30'))).toBe('bf92507 2026-11-26 09:30');
  });

  it('finds it whichever quotes and order the build tool used', () => {
    expect(buildFromHtml(`<meta content='abc123' name='schooltrack-build'>`)).toBe(null);
    expect(buildFromHtml(`<meta name='schooltrack-build' content='abc123'>`)).toBe('abc123');
  });

  it('says nothing rather than guessing when the page has no stamp', () => {
    expect(buildFromHtml('<html><head></head></html>')).toBe(null);
    expect(buildFromHtml('')).toBe(null);
  });

  it('is not fooled by another meta tag', () => {
    const html = '<meta name="viewport" content="width=device-width">' + page('real');
    expect(buildFromHtml(html)).toBe('real');
  });
});

describe('whether to ask for a reload', () => {
  it('asks when the live build is a different one', () => {
    expect(isStale('5701e01', 'bf92507')).toBe(true);
  });

  it('stays quiet when they match', () => {
    expect(isStale('bf92507', 'bf92507')).toBe(false);
  });

  it('STAYS QUIET when the live build could not be read', () => {
    // A school on a thin line loses the check before it loses the app, and a
    // nag raised by a failed fetch teaches people to ignore the real one.
    expect(isStale('bf92507', null)).toBe(false);
    expect(isStale('bf92507', '')).toBe(false);
  });

  it('never nags a dev server, which is whatever it last handed over', () => {
    expect(isStale('dev', 'bf92507')).toBe(false);
  });
});

describe('asking the server', () => {
  const ok = (html: string) =>
    (async () => ({ ok: true, text: async () => html })) as unknown as typeof fetch;

  it('reads the build from the live index.html', async () => {
    expect(await liveBuild(ok(page('live-one')))).toBe('live-one');
  });

  it('asks past any cache in the way', async () => {
    let seen: [string, RequestInit] | null = null;
    const spy = (async (url: string, init: RequestInit) => {
      seen = [url, init];
      return { ok: true, text: async () => page('x') };
    }) as unknown as typeof fetch;
    await liveBuild(spy);
    expect(seen![0]).toContain('stamp=');
    expect(seen![1].cache).toBe('no-store');
  });

  it('answers null rather than throwing when the network is down', async () => {
    const dead = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    expect(await liveBuild(dead)).toBe(null);
  });

  it('answers null on a server error, not the error page text', async () => {
    const bad = (async () => ({ ok: false, text: async () => '<html>502</html>' })) as unknown as typeof fetch;
    expect(await liveBuild(bad)).toBe(null);
  });
});
