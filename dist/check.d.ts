/**
 * The two entry points: checkPlaylist for one playlist and scanWarningPlaylists
 * for the set an artist pastes after a distributor's artificial streaming
 * warning. Both fetch public data from Spotify, score it and return plain
 * objects. The command line tool and the MCP server are thin wrappers.
 */
import type { JevResult } from './jev.js';
import type { ScoreFactor, ScoreLevel } from './bot-scorer.js';
import { type SpotifyCredentials } from './spotify.js';
import type { Snap } from './history.js';
import { type StreamFarmSignals } from './stream-farm-signals.js';
import { type FullReport } from './warning-scan.js';
export type CheckOptions = Partial<SpotifyCredentials> & {
    /** Your own TypeSafe API key. Jev is optional and off unless this is set. */
    jevApiKey?: string;
    /** Follower history, newest first, if you track it. Adds the spike and drop signals. */
    snapshots?: Snap[];
};
export type ScanOptions = Partial<SpotifyCredentials> & {
    jevApiKey?: string;
};
export type PlaylistSummary = {
    id: string;
    name: string;
    url: string;
    owner: string;
    description: string | null;
    followers: number;
    tracks: number;
};
export type CheckReport = {
    playlist: PlaylistSummary;
    score: number;
    level: ScoreLevel;
    factors: ScoreFactor[];
    /** True when follower history was supplied and used. */
    historical: boolean;
    jev: JevResult;
    /** Measured, reported, never scored. Null when too few tracks could be sampled. */
    streamFarm: StreamFarmSignals | null;
};
export type ScanReport = {
    report: FullReport;
    /** Measured, reported, never scored. Keyed by playlist id. */
    streamFarm: Record<string, StreamFarmSignals>;
    /** Valid, distinct links past the 50 playlist cap that were left out. */
    overCap: number;
};
export type CheckErrorCode = 'invalid_url' | 'not_found' | 'spotify_owned' | 'unverifiable' | 'spotify_unavailable';
export declare class CheckError extends Error {
    code: CheckErrorCode;
    constructor(code: CheckErrorCode, message: string);
}
/**
 * Check one playlist. Throws CheckError for a bad link, a playlist Spotify does
 * not return, a Spotify-owned playlist, or an unreachable Spotify, and
 * SpotifyConfigError when no credentials are supplied.
 */
export declare function checkPlaylist(urlOrId: string, options?: CheckOptions): Promise<CheckReport>;
/**
 * Score every playlist link in `input`: free text or a list, up to 50 links.
 * Per-playlist failures become skipped rows. Throws CheckError when no link is
 * valid or when Spotify fails for every playlist.
 */
export declare function scanWarningPlaylists(input: string | string[], options?: ScanOptions): Promise<ScanReport>;
