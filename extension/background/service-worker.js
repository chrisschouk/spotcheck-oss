/**
 * SpotCheck service worker.
 *
 * The only job here is to ask the free checker at spotcheck.cc about one
 * playlist and hand the answer back to the popup or the Spotify page. There
 * are no accounts, no stored data and no background timers.
 */

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

const SPOTCHECK_API_BASE = 'https://spotcheck.cc';
const CHECK_CACHE_TTL_MS = 10 * 60 * 1000;
const CHECK_TIMEOUT_MS = 20 * 1000;
const PLAYLIST_ID = /^[A-Za-z0-9]{1,64}$/;

// A repeat check of the same playlist within ten minutes reuses the answer, so
// opening the popup after the page badge does not spend another of the day's
// three checks. Held in memory only; it is gone when the worker stops.
const checkCache = new Map();

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Check a playlist and return the server's answer with its HTTP status.
 * `status: 0` means no answer came back.
 */
async function handleCheckPlaylist(playlistId) {
  if (typeof playlistId !== 'string' || !PLAYLIST_ID.test(playlistId)) {
    return { ok: false, status: 400, message: 'Enter a valid Spotify playlist link.' };
  }

  const hit = checkCache.get(playlistId);
  if (hit && Date.now() - hit.at < CHECK_CACHE_TTL_MS) return { ...hit.response, cached: true };

  const response = await postCheck(playlistId);
  if (response.ok) checkCache.set(playlistId, { at: Date.now(), response });
  return response;
}

async function postCheck(playlistId) {
  try {
    const response = await fetchWithTimeout(
      `${SPOTCHECK_API_BASE}/api/check`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: `https://open.spotify.com/playlist/${playlistId}` }),
      },
      CHECK_TIMEOUT_MS,
    );
    const data = await response.json().catch(() => ({}));
    return { ...data, ok: response.ok, status: response.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only answer our own popup and content scripts.
  if (sender.id !== browserAPI.runtime.id) return;

  if (message?.type === 'CHECK_PLAYLIST') {
    handleCheckPlaylist(message.playlistId).then(sendResponse);
    return true;
  }
});
