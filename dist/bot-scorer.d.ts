/**
 * History-aware bot risk scoring.
 *
 * Static heuristics (high follower/track ratio, generic name, missing
 * description, round follower count) and a listening signal from track
 * popularity, then follower-history signals layered on top using verdict() and
 * trend() from history.ts over a snapshot series. A recent spike pushes toward
 * 'high'; a steady weekly drop adds a medium factor.
 *
 * Pure and IO-free: callers pass the snapshot series and track popularity in.
 * `historical` is true only when at least two snapshots are supplied. The
 * command line tool and MCP server have no stored history, so they score the
 * static profile and the listening signal only.
 */
import { type Snap } from './history.js';
/**
 * Spotify's track popularity (0-100) reflects how much a track has been played
 * recently across all of Spotify. A playlist with a real following lifts the
 * plays of what it carries, so a large playlist whose typical track sits near
 * zero has followers who do not listen: the bought-follower pattern.
 *
 * Calibrated on 23 Sep 2026 against 56 live playlists from Spotify search. Three
 * large lofi and study playlists (54k to 191k followers) had a median
 * first-page popularity of 0, with 54% to 95% of tracks at 5 or below. Every
 * other playlist above 10,000 followers had a median of 7 or more, most of them
 * 24 to 80. Small personal playlists of obscure tracks also sit at a median of
 * 5 to 8, which is why the follower floor matters.
 */
export declare const LISTENING_MIN_FOLLOWERS = 10000;
export declare const LISTENING_MAX_MEDIAN_POPULARITY = 5;
export declare const LISTENING_MIN_TRACKS_SAMPLED = 20;
/**
 * A median track popularity at or above this means the playlist's audience
 * plays what it carries. The high ratio and generic name rules only guess at
 * inflated followers from a playlist's shape, so this direct evidence overrides
 * them. Lofi Girl's official playlist (7.1M followers, 500 tracks, median 52 on
 * 23 Sep 2026) scored medium on those two guesses alone.
 */
export declare const ENGAGED_MIN_MEDIAN_POPULARITY = 20;
export type ScoreLevel = 'low' | 'medium' | 'high';
export declare const NO_RED_FLAGS_LABEL = "No red flags detected";
export declare const LOW_LISTENING_LABEL = "Followers don't seem to listen";
export type ScoreFactor = {
    label: string;
    level: string;
    description: string;
};
export type ScoreInput = {
    name?: string;
    description?: string | null;
    followers: number;
    tracks: number;
    snapshots?: Snap[];
    /** Popularity of the playable tracks on the playlist's first page of items. */
    trackPopularity?: number[];
};
export type ScoreResult = {
    score: number;
    level: ScoreLevel;
    factors: ScoreFactor[];
    historical: boolean;
};
export type TrackListening = {
    medianPopularity: number;
    nearZeroShare: number;
    sampled: number;
};
export declare function bandFor(score: number): ScoreLevel;
/** Null when too few tracks were sampled for a median to mean anything. */
export declare function trackListening(popularity?: number[]): TrackListening | null;
/**
 * Score a playlist from its static profile, its track popularity and an
 * optional follower-history series.
 */
export declare function scoreWithHistory(input: ScoreInput): ScoreResult;
