/**
 * The playlist verdict every check returns: the heuristic score, lifted by Jev
 * when Jev rates the audience as inorganic. Jev can raise a score to a floor but
 * never lower one, and an unavailable Jev leaves the heuristic untouched.
 * Jev runs only when the caller passes a key.
 */
import { type ScoreInput, type ScoreResult } from './bot-scorer.js';
import { type JevOptions, type JevResult } from './jev.js';
import type { Snap } from './history.js';
import type { PlaylistFull } from './spotify.js';
export declare const JEV_MEDIUM_PROBABILITY = 0.3;
export declare const JEV_HIGH_PROBABILITY = 0.6;
export declare const JEV_FACTOR_LABEL = "Audience pattern looks inorganic";
export type PlaylistVerdict = ScoreResult & {
    jev: JevResult;
};
/**
 * Below this many followers Jev never lifts a score. Artificial streams reach an
 * artist through a playlist's followers, and a few dozen followers cannot carry
 * a meaningful number of them, so there is nothing to warn a buyer about. Small
 * playlists are also where Jev and the heuristic misread personal, organic
 * lists as suspicious.
 */
export declare const JEV_MIN_FOLLOWERS = 1000;
export declare function combineWithJev(result: ScoreResult, jev: JevResult, followers: number): ScoreResult;
export declare function scoreInputFor(playlist: PlaylistFull, snapshots?: Snap[]): ScoreInput;
export declare function scorePlaylist(input: ScoreInput, jevOptions?: JevOptions): Promise<PlaylistVerdict>;
