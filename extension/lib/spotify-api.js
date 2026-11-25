/**
 * Spotify link parsing. Playlist data and its verdict come from /api/check via
 * the service worker; the extension never scores a playlist itself.
 */

export const SpotifyAPI = {
  /**
   * @param {string} url - Spotify playlist URL, URI, embed link or bare id
   * @returns {string|null}
   */
  extractPlaylistId(url) {
    if (!url) return null;

    const patterns = [
      /open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/,
      /spotify:playlist:([a-zA-Z0-9]+)/,
      /^([a-zA-Z0-9]{22})$/,
      /embed\/playlist\/([a-zA-Z0-9]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }

    return null;
  },
};

/** Extract a Spotify track id from a URL, URI, or bare 22-char id. */
export function extractTrackId(input) {
  if (!input || typeof input !== 'string') return null;
  const s = input.trim();
  const m =
    s.match(/spotify:track:([A-Za-z0-9]{22})/) ||
    s.match(/open\.spotify\.com\/track\/([A-Za-z0-9]{22})/) ||
    s.match(/^([A-Za-z0-9]{22})$/);
  return m ? m[1] : null;
}
