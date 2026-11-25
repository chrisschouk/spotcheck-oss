/**
 * Jev, TypeSafe's decision model, asked one typed question about a playlist:
 * is its audience inorganic? Optional, and off unless the caller supplies their
 * own TypeSafe API key. Without a key the heuristic scorer runs alone.
 *
 * Jev only sees the public playlist data the scorer already holds. Every
 * failure becomes an `unavailable` result, so a caller can always fall back to
 * the heuristic.
 */
import { type ScoreInput } from './bot-scorer.js';
export declare const JEV_TIMEOUT_MS = 2500;
export declare const INORGANIC_QUESTION = "This Spotify playlist's audience is inorganic: bought followers, a bot farm, or a purchased batch of followers now being culled. Round package-sized follower counts, sudden 24-hour spikes, steady week-on-week follower losses and implausible follower-to-track ratios are warning signs. So is a large following whose tracks have near-zero Spotify popularity (a median track popularity close to 0 out of 100), because real followers play what they follow. Small personal playlists with few followers are normal and not inorganic.";
export type JevUnavailableReason = 'timeout' | 'rate_limited' | 'auth' | 'no_credit' | 'error';
export type JevResult = {
    status: 'ok';
    probability: number;
    inputTokens?: number;
} | {
    status: 'unavailable';
    reason: JevUnavailableReason;
};
export type JevOptions = {
    /** Your own TypeSafe API key. Without one, askJev returns `unavailable` and sends nothing. */
    apiKey?: string;
    timeoutMs?: number;
    fetch?: typeof fetch;
};
/** Newest-first follower history, as days ago, so Jev reads recency directly. */
export declare function jevState(input: ScoreInput, now?: number): string;
export declare function jevRequestBody(input: ScoreInput, now?: number): string;
/** Never throws. Retries 429/529s only while the timeout budget allows. */
export declare function askJev(input: ScoreInput, options?: JevOptions): Promise<JevResult>;
