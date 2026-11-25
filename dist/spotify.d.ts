/**
 * Spotify helpers, using the client-credentials grant. Public playlist data
 * only: no user sign-in and no access to anyone's private library.
 */
export type SpotifyCredentials = {
    spotifyClientId: string;
    spotifyClientSecret: string;
};
export declare class SpotifyConfigError extends Error {
    constructor();
}
export declare function getClientCredentialsToken(credentials: Partial<SpotifyCredentials>): Promise<{
    access_token: string;
    token_type: string;
    expires_in: number;
}>;
/** Error from a non-OK Spotify response, carrying the upstream status. */
export declare class SpotifyApiError extends Error {
    status: number;
    constructor(status: number, detail: string);
}
export type PlaylistFull = {
    id: string;
    name: string | null;
    description: string | null;
    public: boolean | null;
    followers: {
        total: number;
    };
    tracks: {
        total: number;
    };
    /** Popularity of the playable tracks on the first page of items (up to 100). */
    trackPopularity: number[];
    /** The same playable tracks with their first artist and when they were added. */
    trackItems: TrackItem[];
    images: Array<{
        url: string;
    }>;
    owner: {
        id?: string;
        display_name: string | null;
        external_urls?: {
            spotify?: string;
        };
    };
    external_urls?: {
        spotify?: string;
    };
};
export type TrackItem = {
    popularity: number;
    artistId: string | null;
    addedAt: string | null;
};
/**
 * Follower counts for a set of artist ids, 50 per request (Spotify's limit).
 * Missing or failed batches are simply absent from the map: callers treat this
 * as best-effort enrichment, never as a reason to fail a check.
 */
export declare function fetchArtistFollowers(ids: string[], token: string): Promise<Map<string, number>>;
/**
 * Fetch the public playlist fields the scorer needs. Throws
 * SpotifyApiError (carrying the upstream status, e.g. 404 for a private/
 * deleted playlist) so a caller can map it to a clear message.
 */
export declare function fetchPlaylist(playlistId: string, token: string): Promise<PlaylistFull>;
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
export declare function isSpotifyGeneratedPlaylistId(playlistId: string): boolean;
export type PlaylistOwnerLookup = {
    kind: 'owned_by_spotify';
} | {
    kind: 'owned_by_other';
    ownerId: string;
} | {
    kind: 'not_found';
} | {
    kind: 'unknown';
};
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
export declare function lookupPlaylistOwnerFromPublicPage(playlistId: string): Promise<PlaylistOwnerLookup>;
/** Wording for a 404 on a playlist that is private or deleted. */
export declare const PLAYLIST_NOT_FOUND_MESSAGE = "Playlist not found. It may be private or deleted.";
/** Shared wording for a 404 confirmed as Spotify's own generated playlist. */
export declare const SPOTIFY_GENERATED_PLAYLIST_MESSAGE: string;
/** Shared wording for a 404 we can neither confirm nor rule out as Spotify's own. */
export declare const PLAYLIST_UNVERIFIABLE_MESSAGE: string;
/** Extract a playlist id from a Spotify URL, URI or bare id. Null when invalid. */
export declare function extractPlaylistId(input: string): string | null;
