/**
 * The playlist verdict every check returns: the heuristic score, lifted by Jev
 * when Jev rates the audience as inorganic. Jev can raise a score to a floor but
 * never lower one, and an unavailable Jev leaves the heuristic untouched.
 * Jev runs only when the caller passes a key.
 */
import { bandFor, NO_RED_FLAGS_LABEL, scoreWithHistory, } from './bot-scorer.js';
import { askJev } from './jev.js';
export const JEV_MEDIUM_PROBABILITY = 0.3;
export const JEV_HIGH_PROBABILITY = 0.6;
const MEDIUM_FLOOR = 25;
const HIGH_FLOOR = 50;
export const JEV_FACTOR_LABEL = 'Audience pattern looks inorganic';
/**
 * Below this many followers Jev never lifts a score. Artificial streams reach an
 * artist through a playlist's followers, and a few dozen followers cannot carry
 * a meaningful number of them, so there is nothing to warn a buyer about. Small
 * playlists are also where Jev and the heuristic misread personal, organic
 * lists as suspicious.
 */
export const JEV_MIN_FOLLOWERS = 1000;
const HIGH_LIFT = {
    floor: HIGH_FLOOR,
    level: 'danger',
    description: "Our pattern model rates this playlist's follower history and counts as very likely bought or botted.",
};
const MEDIUM_LIFT = {
    floor: MEDIUM_FLOOR,
    level: 'warning',
    description: "Our pattern model rates this playlist's follower history and counts as likely bought or botted.",
};
/**
 * A medium lift needs the heuristic to have seen at least one warning sign.
 * On 22 Sep 2026 a clean, organic-looking indie playlist (59,813 followers,
 * 383 tracks) scored exactly 0.30, the same band as the corpus bots Jev caught,
 * and every one of those bots also carried one weak heuristic signal.
 */
function liftFor(probability, heuristicSawWarning, followers) {
    if (followers < JEV_MIN_FOLLOWERS)
        return null;
    if (probability >= JEV_HIGH_PROBABILITY)
        return HIGH_LIFT;
    if (probability >= JEV_MEDIUM_PROBABILITY && heuristicSawWarning)
        return MEDIUM_LIFT;
    return null;
}
export function combineWithJev(result, jev, followers) {
    if (jev.status !== 'ok')
        return result;
    const lift = liftFor(jev.probability, result.score > 0, followers);
    if (!lift)
        return result;
    const score = Math.max(result.score, lift.floor);
    const factor = { label: JEV_FACTOR_LABEL, level: lift.level, description: lift.description };
    return {
        ...result,
        score,
        level: bandFor(score),
        factors: [...result.factors.filter(f => f.label !== NO_RED_FLAGS_LABEL), factor],
    };
}
export function scoreInputFor(playlist, snapshots = []) {
    return {
        name: playlist.name ?? undefined,
        description: playlist.description,
        followers: playlist.followers.total,
        tracks: playlist.tracks.total,
        trackPopularity: playlist.trackPopularity,
        snapshots,
    };
}
export async function scorePlaylist(input, jevOptions = {}) {
    const jev = await askJev(input, jevOptions);
    return { ...combineWithJev(scoreWithHistory(input), jev, input.followers), jev };
}
