/**
 * The one way the extension checks a playlist: ask the service worker, which
 * calls spotcheck.cc/api/check, and read the server's verdict. There is no
 * local scorer, so the popup and the in-page badge always agree with the
 * website.
 *
 * Loaded statically by the popup and dynamically by the content script, so it
 * is listed under web_accessible_resources in every manifest.
 */

export const CHECK_PLAYLIST = 'CHECK_PLAYLIST';

export const TAP_URL = 'https://totalaudiopromo.com';

const COULD_NOT_CHECK = "Couldn't check this playlist";

const UNREACHABLE = {
  kind: 'failed',
  title: COULD_NOT_CHECK,
  detail: "We couldn't reach SpotCheck. Check your connection and try again.",
};

/**
 * @param {{ sendMessage: Function }} runtime - chrome.runtime / browser.runtime
 * @param {string} playlistId
 * @returns {Promise<{ ok: boolean, status: number, [k: string]: any }>}
 */
export async function requestCheck(runtime, playlistId) {
  try {
    const response = await runtime.sendMessage({ type: CHECK_PLAYLIST, playlistId });
    return response ?? { ok: false, status: 0 };
  } catch {
    return { ok: false, status: 0 };
  }
}

/**
 * Turn a /api/check response into what the UI shows. `status: 0` means the
 * request never got an answer; the UI says so instead of guessing a score.
 * A 429 carries the server's own message and a link to TAP.
 */
export function interpretCheck(res) {
  if (res.ok && res.playlist && res.botData) {
    return { kind: 'verdict', cached: res.cached === true, playlist: res.playlist, botData: res.botData };
  }
  if (res.status === 429) {
    return {
      kind: 'limit',
      message: res.message || "You've used today's free checks. They come back tomorrow.",
      next: {
        message: res.next?.message || 'Check every playlist in your campaign in TAP',
        url: TAP_URL,
      },
    };
  }
  if (!res.status) return UNREACHABLE;
  return {
    kind: 'failed',
    title: COULD_NOT_CHECK,
    detail: res.message || 'Something went wrong on our side. Try again in a moment.',
  };
}

/** One line for surfaces with room for a single message, such as the in-page toast. */
export function checkMessage(result) {
  switch (result.kind) {
    case 'limit':
      return `${result.message} ${result.next.message}: ${result.next.url}`;
    case 'failed':
      return `${result.title}. ${result.detail}`;
    default:
      return '';
  }
}
