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
import { trend, verdict } from './history.js';
const GENERIC_NAMES = ['chill', 'vibes', 'lofi', 'study', 'sleep', 'workout'];
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
export const LISTENING_MIN_FOLLOWERS = 10_000;
export const LISTENING_MAX_MEDIAN_POPULARITY = 5;
export const LISTENING_MIN_TRACKS_SAMPLED = 20;
const NEAR_ZERO_POPULARITY = 5;
/**
 * A median track popularity at or above this means the playlist's audience
 * plays what it carries. The high ratio and generic name rules only guess at
 * inflated followers from a playlist's shape, so this direct evidence overrides
 * them. Lofi Girl's official playlist (7.1M followers, 500 tracks, median 52 on
 * 23 Sep 2026) scored medium on those two guesses alone.
 */
export const ENGAGED_MIN_MEDIAN_POPULARITY = 20;
export const NO_RED_FLAGS_LABEL = 'No red flags detected';
export const LOW_LISTENING_LABEL = "Followers don't seem to listen";
export function bandFor(score) {
    if (score >= 50)
        return 'high';
    if (score >= 25)
        return 'medium';
    return 'low';
}
/** Null when too few tracks were sampled for a median to mean anything. */
export function trackListening(popularity = []) {
    if (popularity.length < LISTENING_MIN_TRACKS_SAMPLED)
        return null;
    const sorted = [...popularity].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const medianPopularity = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    const nearZero = sorted.filter(p => p <= NEAR_ZERO_POPULARITY).length;
    return {
        medianPopularity,
        nearZeroShare: Math.round((nearZero / sorted.length) * 100) / 100,
        sampled: sorted.length,
    };
}
function hasEngagedAudience(trackPopularity) {
    const listening = trackListening(trackPopularity);
    return listening !== null && listening.medianPopularity >= ENGAGED_MIN_MEDIAN_POPULARITY;
}
const highRatio = ({ followers, tracks, trackPopularity }) => tracks > 0 && followers / tracks > 10000 && !hasEngagedAudience(trackPopularity)
    ? {
        label: 'Suspiciously high ratio',
        level: 'danger',
        description: 'Over 10,000 followers per track. Often a sign of inflated numbers from bot networks.',
        points: 25,
    }
    : null;
const genericName = ({ name, followers, trackPopularity }) => GENERIC_NAMES.some(n => (name ?? '').toLowerCase().includes(n)) &&
    followers > 50000 &&
    !hasEngagedAudience(trackPopularity)
    ? {
        label: 'Generic name pattern',
        level: 'warning',
        description: 'Names like "chill vibes" or "lofi study" are common with bulk bot-driven playlists.',
        points: 10,
    }
    : null;
const noDescription = ({ description }) => (description ?? '').length < 10
    ? {
        label: 'No description',
        level: 'warning',
        description: 'Real curators usually write a description. Empty descriptions are typical of automated playlists.',
        points: 10,
    }
    : null;
const roundCount = ({ followers }) => followers > 1000 && followers % 1000 === 0
    ? {
        label: 'Round follower count',
        level: 'warning',
        description: 'Exact thousands (10,000 / 25,000) often indicate purchased follower packages.',
        points: 15,
    }
    : null;
const lowListening = ({ followers, trackPopularity }) => {
    const listening = trackListening(trackPopularity);
    if (followers < LISTENING_MIN_FOLLOWERS || !listening)
        return null;
    if (listening.medianPopularity > LISTENING_MAX_MEDIAN_POPULARITY)
        return null;
    return {
        label: LOW_LISTENING_LABEL,
        level: 'danger',
        description: 'Over 10,000 followers, yet the typical track here has a Spotify popularity of 5 or less out of 100. A real following plays what it follows, so this pattern usually means bought followers.',
        points: 25,
    };
};
// A low follower-to-track ratio is deliberately not a rule: small, new and
// personal playlists all have one, and they are almost always organic.
const STATIC_RULES = [highRatio, genericName, noDescription, roundCount, lowListening];
function historySignals(snapshots) {
    const v = verdict(snapshots);
    const signals = [];
    if (v.spike) {
        signals.push({
            label: 'Recent follower spike',
            level: 'danger',
            description: 'A sharp follower jump in the last 24 hours with no editorial placement. This pattern is consistent with purchased followers.',
            points: 25,
        });
    }
    if (v.drop) {
        signals.push({
            label: 'Sustained follower drop',
            level: 'warning',
            description: 'Followers have fallen week on week. Steady decline can follow a purchased-follower batch being culled by Spotify.',
            points: 15,
        });
    }
    const change7d = trend(snapshots).change7d;
    if (signals.length === 0 && change7d != null && Math.abs(change7d) < 1) {
        signals.push({
            label: 'Flat follower history',
            level: '',
            description: 'Follower count has been broadly stable over the past week. No anomaly signals from the monitored history.',
            points: 0,
        });
    }
    return signals;
}
const NO_RED_FLAGS = {
    label: NO_RED_FLAGS_LABEL,
    level: '',
    description: 'None of the automated signals fired. Worth pitching, but always cross-check the curator.',
};
/**
 * Score a playlist from its static profile, its track popularity and an
 * optional follower-history series.
 */
export function scoreWithHistory(input) {
    const normalised = { ...input, followers: input.followers || 0, tracks: input.tracks || 0 };
    const snapshots = input.snapshots ?? [];
    const historical = snapshots.length >= 2;
    const signals = [
        ...STATIC_RULES.map(rule => rule(normalised)).filter((s) => s !== null),
        ...(historical ? historySignals(snapshots) : []),
    ];
    const score = signals.reduce((sum, s) => sum + s.points, 0);
    const factors = signals.map(({ points: _points, ...factor }) => factor);
    return {
        score: Math.min(score, 100),
        level: bandFor(score),
        factors: factors.length > 0 ? factors : [NO_RED_FLAGS],
        historical,
    };
}
