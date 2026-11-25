/**
 * Spotify helpers, using the client-credentials grant. Public playlist data
 * only: no user sign-in and no access to anyone's private library.
 */
export class SpotifyConfigError extends Error {
    constructor() {
        super('Spotify credentials missing. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET from a Spotify developer app.');
        this.name = 'SpotifyConfigError';
    }
}
export async function getClientCredentialsToken(credentials) {
    const { spotifyClientId: clientId, spotifyClientSecret: clientSecret } = credentials;
    if (!clientId || !clientSecret)
        throw new SpotifyConfigError();
    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        },
        body: 'grant_type=client_credentials',
    });
    if (!response.ok)
        throw new SpotifyApiError(response.status, await response.text());
    return response.json();
}
/** Error from a non-OK Spotify response, carrying the upstream status. */
export class SpotifyApiError extends Error {
    status;
    constructor(status, detail) {
        super(`Spotify request failed (${status}): ${detail}`);
        this.name = 'SpotifyApiError';
        this.status = status;
    }
}
/** Local files, episodes and removed tracks carry no meaningful popularity. */
function trackItems(items) {
    if (!Array.isArray(items))
        return [];
    return items.flatMap(item => {
        const popularity = item?.track?.popularity;
        const playable = item?.is_local !== true && item?.track?.type === 'track';
        if (!playable || typeof popularity !== 'number')
            return [];
        const artistId = item?.track?.artists?.[0]?.id;
        return [{
                popularity,
                artistId: typeof artistId === 'string' ? artistId : null,
                addedAt: typeof item?.added_at === 'string' ? item.added_at : null,
            }];
    });
}
const ARTISTS_PER_REQUEST = 50;
/**
 * Follower counts for a set of artist ids, 50 per request (Spotify's limit).
 * Missing or failed batches are simply absent from the map: callers treat this
 * as best-effort enrichment, never as a reason to fail a check.
 */
export async function fetchArtistFollowers(ids, token) {
    const unique = [...new Set(ids)];
    const followers = new Map();
    for (let i = 0; i < unique.length; i += ARTISTS_PER_REQUEST) {
        const batch = unique.slice(i, i + ARTISTS_PER_REQUEST);
        const response = await fetch(`https://api.spotify.com/v1/artists?ids=${batch.join(',')}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok)
            continue;
        const data = (await response.json());
        for (const artist of data.artists ?? []) {
            if (artist?.id && typeof artist.followers?.total === 'number')
                followers.set(artist.id, artist.followers.total);
        }
    }
    return followers;
}
/**
 * Fetch the public playlist fields the scorer needs. Throws
 * SpotifyApiError (carrying the upstream status, e.g. 404 for a private/
 * deleted playlist) so a caller can map it to a clear message.
 */
export async function fetchPlaylist(playlistId, token) {
    const fields = 'id,name,description,public,followers(total),tracks(total,items(added_at,is_local,track(type,popularity,artists(id)))),images,owner(id,display_name,external_urls),external_urls';
    const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}?fields=${fields}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
        throw new SpotifyApiError(response.status, await response.text());
    }
    return toPlaylistFull(await response.json(), playlistId);
}
function toPlaylistFull(data, playlistId) {
    return {
        id: data.id ?? playlistId,
        name: data.name ?? null,
        description: data.description ?? null,
        public: data.public ?? null,
        followers: { total: data.followers?.total ?? 0 },
        tracks: { total: data.tracks?.total ?? 0 },
        trackPopularity: trackItems(data.tracks?.items).map(item => item.popularity),
        trackItems: trackItems(data.tracks?.items),
        images: Array.isArray(data.images) ? data.images : [],
        owner: {
            id: data.owner?.id,
            display_name: data.owner?.display_name ?? null,
            external_urls: data.owner?.external_urls,
        },
        external_urls: data.external_urls,
    };
}
/**
 * Cheap pre-filter, not the final answer: true when a playlist id sits in
 * Spotify's own reserved namespace for playlists it generates itself
 * (editorial ones like Today's Top Hits and New Music Friday, and
 * personalised ones like Discover Weekly). Real third-party playlists never
 * land in this namespace (verified: 1PmwMQY86pJuAm7veFt3u2, a 59k-follower
 * independent playlist, is outside it), so a false positive here isn't a
 * live risk. But a match still only means "worth confirming", not "is
 * Spotify's". Confirm with lookupPlaylistOwnerFromPublicPage before telling
 * anyone why their check failed.
 */
export function isSpotifyGeneratedPlaylistId(playlistId) {
    return playlistId.startsWith('37i9dQZ');
}
/**
 * Confirms who owns a playlist using Spotify's own public web page, with no
 * API token needed. It's the one check left when the authenticated API 404s
 * without a body: `fetchPlaylist` throws on a Today's Top Hits id with
 * `{"error":{"status":404,"message":"Resource not found"}}` and nothing
 * else, the same shape a genuinely deleted playlist returns, so there is no
 * owner field to read off that failure. The public page at
 * open.spotify.com/playlist/<id> carries a `music:creator` meta tag naming
 * the real owning account directly, unauthenticated.
 *
 * Verified live on 11 Sep 2026: Today's Top Hits and New Music Friday both
 * report `music:creator` as `open.spotify.com/user/spotify`; the real
 * independent playlist above reports its actual username; a genuinely
 * nonexistent id 404s the page itself, same as the API.
 *
 * Best-effort: Spotify doesn't document or support this page's markup, so a
 * layout change or a fetch failure returns `unknown` rather than a guess.
 * Callers must treat `unknown` and `owned_by_other` as "can't tell", never
 * as evidence either way.
 */
export async function lookupPlaylistOwnerFromPublicPage(playlistId) {
    try {
        const response = await fetch(`https://open.spotify.com/playlist/${playlistId}`, {
            headers: {
                'User-Agent': 'spotcheck-oss (+https://github.com/chrisschouk/spotcheck-oss)',
            },
        });
        if (response.status === 404)
            return { kind: 'not_found' };
        if (!response.ok)
            return { kind: 'unknown' };
        const html = await response.text();
        const match = html.match(/name="music:creator"\s+content="https:\/\/open\.spotify\.com\/user\/([^"]+)"/);
        if (!match)
            return { kind: 'unknown' };
        return match[1] === 'spotify'
            ? { kind: 'owned_by_spotify' }
            : { kind: 'owned_by_other', ownerId: match[1] };
    }
    catch {
        return { kind: 'unknown' };
    }
}
/** Wording for a 404 on a playlist that is private or deleted. */
export const PLAYLIST_NOT_FOUND_MESSAGE = 'Playlist not found. It may be private or deleted.';
/** Shared wording for a 404 confirmed as Spotify's own generated playlist. */
export const SPOTIFY_GENERATED_PLAYLIST_MESSAGE = "Spotify doesn't make its own editorial and algorithmic playlists, such as Today's Top " +
    "Hits, New Music Friday or Discover Weekly, available to outside tools. That's a Spotify " +
    'restriction, not a problem with your link. Try a playlist that takes outside submissions ' +
    'instead. Those are the ones curators actually run, and the ones worth checking before you ' +
    'pay for a placement.';
/** Shared wording for a 404 we can neither confirm nor rule out as Spotify's own. */
export const PLAYLIST_UNVERIFIABLE_MESSAGE = "We couldn't check this playlist. Spotify didn't return data for it and we can't confirm " +
    "why, so this isn't necessarily a problem with your link. Try again shortly, or try a " +
    'different playlist.';
/** Extract a playlist id from a Spotify URL, URI or bare id. Null when invalid. */
export function extractPlaylistId(input) {
    const trimmed = (input || '').trim();
    if (!trimmed)
        return null;
    // open.spotify.com/playlist/<id> (optionally /intl-xx/ or query/hash)
    const urlMatch = trimmed.match(/playlist[/:]([a-zA-Z0-9]{22})/);
    if (urlMatch)
        return urlMatch[1];
    // bare 22-char base62 id
    if (/^[a-zA-Z0-9]{22}$/.test(trimmed))
        return trimmed;
    return null;
}
