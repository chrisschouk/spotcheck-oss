/**
 * Stream-farm signals, measured but not scored.
 *
 * The scorer in bot-scorer.ts looks for bought followers: big audiences that
 * do not play what they follow. A distributor's artificial streaming warning
 * is about bought streams, which can look the other way round: tracks played
 * far more than their artists' own fanbase explains, on playlists that churn
 * paid placements.
 *
 * These numbers are reported next to a warning scan so they can be calibrated
 * against playlists from real warnings. Nothing here changes a verdict until
 * that data shows which thresholds separate farms from real lists.
 */
import type { TrackItem } from './spotify.js';
/** An artist this small has almost no fanbase of their own to stream them. */
export declare const FANLESS_MAX_ARTIST_FOLLOWERS = 1000;
/** Popularity this high means real volume of recent plays. */
export declare const FANLESS_MIN_POPULARITY = 25;
export declare const RECENT_ADD_DAYS = 30;
export declare const MIN_TRACKS_FOR_SIGNALS = 10;
export type StreamFarmSignals = {
    /** Tracks with a known artist follower count. */
    sampled: number;
    medianPopularity: number;
    medianArtistFollowers: number;
    /** Share of tracks played well beyond what their artist's fanbase explains. */
    fanlessPlayShare: number;
    /** Share of tracks added in the last RECENT_ADD_DAYS: placement churn. */
    recentAddShare: number;
};
/** Null when too few tracks have a known artist for the shares to mean anything. */
export declare function streamFarmSignals(items: TrackItem[], artistFollowers: Map<string, number>, now?: Date): StreamFarmSignals | null;
