/**
 * The two entry points: checkPlaylist for one playlist and scanWarningPlaylists
 * for the set an artist pastes after a distributor's artificial streaming
 * warning. Both fetch public data from Spotify, score it and return plain
 * objects. The command line tool and the MCP server are thin wrappers.
 */
import { scoreInputFor, scorePlaylist } from './playlist-verdict.js';
import { extractPlaylistId, fetchArtistFollowers, fetchPlaylist, getClientCredentialsToken, isSpotifyGeneratedPlaylistId, lookupPlaylistOwnerFromPublicPage, PLAYLIST_NOT_FOUND_MESSAGE, PLAYLIST_UNVERIFIABLE_MESSAGE, SPOTIFY_GENERATED_PLAYLIST_MESSAGE, SpotifyApiError, } from './spotify.js';
import { streamFarmSignals } from './stream-farm-signals.js';
import { buildReport, parseScanInput, reasonFor, } from './warning-scan.js';
export class CheckError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'CheckError';
        this.code = code;
    }
}
const FETCH_CONCURRENCY = 5;
const JEV_CONCURRENCY = 10;
const playlistUrl = (id) => `https://open.spotify.com/playlist/${id}`;
async function mapWithConcurrency(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    async function worker() {
        while (next < items.length) {
            const index = next++;
            results[index] = await fn(items[index]);
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
}
/**
 * A 404 on an id in Spotify's reserved namespace is only a candidate for
 * "Spotify's own playlist". The public page confirms it before anyone is told
 * that was the reason.
 */
async function notFoundReason(playlistId) {
    if (!isSpotifyGeneratedPlaylistId(playlistId))
        return 'not_found';
    const lookup = await lookupPlaylistOwnerFromPublicPage(playlistId);
    if (lookup.kind === 'owned_by_spotify')
        return 'spotify_owned';
    return lookup.kind === 'not_found' ? 'not_found' : 'unverifiable';
}
function summarise(playlist) {
    return {
        id: playlist.id,
        name: playlist.name ?? 'Untitled playlist',
        url: playlist.external_urls?.spotify ?? playlistUrl(playlist.id),
        owner: playlist.owner.display_name ?? playlist.owner.id ?? 'Unknown curator',
        description: playlist.description,
        followers: playlist.followers.total,
        tracks: playlist.tracks.total,
    };
}
/** Best-effort: a failure here costs the report its stream-farm numbers, never the check. */
async function measureStreamFarm(playlists, token) {
    const signals = new Map();
    try {
        const artistIds = playlists.flatMap(p => p.trackItems.flatMap(t => (t.artistId ? [t.artistId] : [])));
        const followers = await fetchArtistFollowers(artistIds, token);
        for (const playlist of playlists) {
            const measured = streamFarmSignals(playlist.trackItems, followers);
            if (measured)
                signals.set(playlist.id, measured);
        }
    }
    catch {
        // Enrichment only.
    }
    return signals;
}
/**
 * Check one playlist. Throws CheckError for a bad link, a playlist Spotify does
 * not return, a Spotify-owned playlist, or an unreachable Spotify, and
 * SpotifyConfigError when no credentials are supplied.
 */
export async function checkPlaylist(urlOrId, options = {}) {
    const playlistId = extractPlaylistId(urlOrId);
    if (!playlistId)
        throw new CheckError('invalid_url', 'Enter a valid Spotify playlist link.');
    const { access_token: token } = await getClientCredentialsToken(options);
    let playlist;
    try {
        playlist = await fetchPlaylist(playlistId, token);
    }
    catch (error) {
        if (error instanceof SpotifyApiError && error.status === 404) {
            const reason = await notFoundReason(playlistId);
            if (reason === 'spotify_owned')
                throw new CheckError('spotify_owned', SPOTIFY_GENERATED_PLAYLIST_MESSAGE);
            if (reason === 'unverifiable')
                throw new CheckError('unverifiable', PLAYLIST_UNVERIFIABLE_MESSAGE);
            throw new CheckError('not_found', PLAYLIST_NOT_FOUND_MESSAGE);
        }
        throw new CheckError('spotify_unavailable', "Spotify isn't answering right now. Try again in a few minutes.");
    }
    const jevOptions = { apiKey: options.jevApiKey };
    const [verdict, signals] = await Promise.all([
        scorePlaylist(scoreInputFor(playlist, options.snapshots ?? []), jevOptions),
        measureStreamFarm([playlist], token),
    ]);
    return {
        playlist: summarise(playlist),
        score: verdict.score,
        level: verdict.level,
        factors: verdict.factors,
        historical: verdict.historical,
        jev: verdict.jev,
        streamFarm: signals.get(playlist.id) ?? null,
    };
}
async function fetchOne(playlistId, token) {
    try {
        return { ok: true, playlist: { ...(await fetchPlaylist(playlistId, token)), id: playlistId } };
    }
    catch (error) {
        let why = 'error';
        if (error instanceof SpotifyApiError && error.status === 404) {
            const reason = await notFoundReason(playlistId);
            why = reason === 'spotify_owned' ? 'spotify_owned' : 'not_found';
        }
        return { ok: false, row: { kind: 'skipped', input: playlistUrl(playlistId), playlistId, why } };
    }
}
function scoredRow(playlist, verdict) {
    const summary = summarise(playlist);
    return {
        kind: 'scored',
        playlistId: summary.id,
        url: summary.url,
        name: summary.name,
        owner: summary.owner,
        followers: summary.followers,
        tracks: summary.tracks,
        score: verdict.score,
        level: verdict.level,
        reason: reasonFor(verdict.factors),
    };
}
/**
 * Score every playlist link in `input`: free text or a list, up to 50 links.
 * Per-playlist failures become skipped rows. Throws CheckError when no link is
 * valid or when Spotify fails for every playlist.
 */
export async function scanWarningPlaylists(input, options = {}) {
    const text = Array.isArray(input) ? input.join('\n') : input;
    const parsed = parseScanInput(text);
    if (parsed.ids.length === 0) {
        throw new CheckError('invalid_url', 'Provide at least one Spotify playlist link.');
    }
    const { access_token: token } = await getClientCredentialsToken(options);
    const fetched = await mapWithConcurrency(parsed.ids, FETCH_CONCURRENCY, id => fetchOne(id, token));
    if (fetched.every(f => !f.ok && f.row.why === 'error')) {
        throw new CheckError('spotify_unavailable', "Spotify isn't answering right now. Try again in a few minutes.");
    }
    const jevOptions = { apiKey: options.jevApiKey };
    const [rows, signals] = await Promise.all([
        mapWithConcurrency(fetched, JEV_CONCURRENCY, async (f) => f.ok ? scoredRow(f.playlist, await scorePlaylist(scoreInputFor(f.playlist), jevOptions)) : f.row),
        measureStreamFarm(fetched.flatMap(f => (f.ok ? [f.playlist] : [])), token),
    ]);
    return {
        report: buildReport([...rows, ...parsed.skipped]),
        streamFarm: Object.fromEntries(signals),
        overCap: parsed.overCap,
    };
}
