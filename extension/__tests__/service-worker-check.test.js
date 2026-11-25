import { beforeEach, describe, expect, it, vi } from 'vitest';
import { interpretCheck, requestCheck } from '../lib/check-result.js';

let messageListener;

const LOFI_GIRL = '0vvXsWCC9xrXsKd4FyS8kM';

const runtime = {
  sendMessage: message =>
    new Promise(resolve => {
      const keepAlive = messageListener(message, { id: 'spotcheck-extension-id' }, resolve);
      if (keepAlive !== true) resolve(undefined);
    }),
};

function answer(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function lastRequest() {
  const [url, options] = global.fetch.mock.calls.at(-1);
  return { url, options, body: JSON.parse(options.body) };
}

const verdict = {
  playlist: { id: LOFI_GIRL, name: 'Lofi Girl', followers: { total: 7_100_000 }, tracks: { total: 500 } },
  botData: { score: 0, level: 'low', factors: [{ label: 'No red flags detected', level: '' }] },
};

beforeEach(async () => {
  vi.restoreAllMocks();
  global.chrome = {
    runtime: {
      id: 'spotcheck-extension-id',
      onMessage: { addListener: vi.fn(listener => { messageListener = listener; }) },
    },
  };
  delete global.browser;
  global.fetch = vi.fn();
  vi.resetModules();
  await import('../background/service-worker.js');
});

describe('CHECK_PLAYLIST', () => {
  it("shows the server's verdict, posting only the playlist link to spotcheck.cc with no credentials", async () => {
    global.fetch.mockResolvedValueOnce(answer(200, verdict));

    const result = interpretCheck(await requestCheck(runtime, LOFI_GIRL));

    expect(result.kind).toBe('verdict');
    expect(result.botData).toMatchObject({ score: 0, level: 'low' });
    const { url, options, body } = lastRequest();
    expect(url).toBe('https://spotcheck.cc/api/check');
    expect(options.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(body).toEqual({ url: `https://open.spotify.com/playlist/${LOFI_GIRL}` });
  });

  it('passes the daily-limit answer through with its message', async () => {
    global.fetch.mockResolvedValueOnce(
      answer(429, { error: 'limit', message: 'Used up', next: { message: 'Check in TAP', url: 'https://totalaudiopromo.com' } }),
    );

    const result = interpretCheck(await requestCheck(runtime, LOFI_GIRL));

    expect(result).toMatchObject({ kind: 'limit', message: 'Used up' });
    expect(result.next.url).toBe('https://totalaudiopromo.com');
  });

  it("says it couldn't check when the API is unreachable", async () => {
    global.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const result = interpretCheck(await requestCheck(runtime, LOFI_GIRL));

    expect(result).toMatchObject({ kind: 'failed', title: "Couldn't check this playlist" });
  });

  it('reuses a verdict for a repeat check instead of spending another of the three', async () => {
    global.fetch.mockResolvedValue(answer(200, verdict));

    await requestCheck(runtime, LOFI_GIRL);
    const again = interpretCheck(await requestCheck(runtime, LOFI_GIRL));

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(again.cached).toBe(true);
  });

  it('does not cache a failure', async () => {
    global.fetch
      .mockResolvedValueOnce(answer(502, { error: 'spotify_error' }))
      .mockResolvedValue(answer(200, verdict));

    await requestCheck(runtime, LOFI_GIRL);
    await requestCheck(runtime, LOFI_GIRL);

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('refuses an id that is not a playlist id without calling the API', async () => {
    const result = await requestCheck(runtime, '../../api/me');
    expect(result.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('ignores messages from other extensions', () => {
    const handled = messageListener({ type: 'CHECK_PLAYLIST', playlistId: LOFI_GIRL }, { id: 'someone-else' }, () => {});
    expect(handled).toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
