import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { CHECK_PLAYLIST, TAP_URL, checkMessage, interpretCheck, requestCheck } from '../lib/check-result.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('requestCheck', () => {
  it('asks the service worker to check the playlist', async () => {
    const runtime = { sendMessage: vi.fn(async () => ({ ok: true, status: 200 })) };
    await requestCheck(runtime, 'abc');
    expect(runtime.sendMessage).toHaveBeenCalledWith({ type: CHECK_PLAYLIST, playlistId: 'abc' });
  });

  it('reports no answer when the service worker is unreachable', async () => {
    const runtime = { sendMessage: vi.fn(async () => { throw new Error('no receiver'); }) };
    expect(await requestCheck(runtime, 'abc')).toEqual({ ok: false, status: 0 });
  });
});

describe('interpretCheck', () => {
  const playlist = { id: 'abc', name: 'Test', followers: { total: 10 }, tracks: { total: 5 } };
  const botData = { score: 40, level: 'medium', factors: [{ label: 'x', level: 'warning' }] };

  it('shows the full server verdict', () => {
    expect(interpretCheck({ ok: true, status: 200, playlist, botData })).toEqual({
      kind: 'verdict',
      cached: false,
      playlist,
      botData,
    });
  });

  it("says it couldn't check when the API never answered, rather than guessing", () => {
    const result = interpretCheck({ ok: false, status: 0 });
    expect(result.kind).toBe('failed');
    expect(result.title).toBe("Couldn't check this playlist");
    expect(result).not.toHaveProperty('botData');
  });

  it('passes the server explanation through for a playlist it could not read', () => {
    const result = interpretCheck({ ok: false, status: 404, message: 'That playlist is private.' });
    expect(result).toMatchObject({ kind: 'failed', detail: 'That playlist is private.' });
  });

  it('shows the 429 message with a link to TAP, ignoring any other url the server sends', () => {
    const result = interpretCheck({
      ok: false,
      status: 429,
      message: 'Used up',
      next: { message: 'Check every playlist in TAP', url: 'https://evil.example' },
    });
    expect(result).toEqual({
      kind: 'limit',
      message: 'Used up',
      next: { message: 'Check every playlist in TAP', url: TAP_URL },
    });
  });
});

describe('checkMessage', () => {
  it('gives the in-page toast one readable line', () => {
    expect(checkMessage(interpretCheck({ ok: false, status: 0 }))).toBe(
      "Couldn't check this playlist. We couldn't reach SpotCheck. Check your connection and try again.",
    );
    expect(checkMessage(interpretCheck({ ok: false, status: 429, message: 'Used up' }))).toBe(
      `Used up Check every playlist in your campaign in TAP: ${TAP_URL}`,
    );
  });
});

describe('the extension has no scorer of its own', () => {
  const sourceFiles = ['lib', 'popup', 'content', 'background'].flatMap(sub =>
    readdirSync(join(dir, sub))
      .filter(name => name.endsWith('.js'))
      .map(name => join(sub, name)),
  );

  it.each(sourceFiles)('%s does not compute a bot score', file => {
    const source = readFileSync(join(dir, file), 'utf8');
    expect(source).not.toMatch(/calculateBotScore|GENERIC_NAMES|Round follower count/);
  });
});
