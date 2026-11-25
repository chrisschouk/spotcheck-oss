/**
 * Jev, TypeSafe's decision model, asked one typed question about a playlist:
 * is its audience inorganic? Optional, and off unless the caller supplies their
 * own TypeSafe API key. Without a key the heuristic scorer runs alone.
 *
 * Jev only sees the public playlist data the scorer already holds. Every
 * failure becomes an `unavailable` result, so a caller can always fall back to
 * the heuristic.
 */
import { trackListening } from './bot-scorer.js';
const TYPESAFE_URL = 'https://api.typesafe.ai/v1/systemone';
/** Pinned: aliases like jev-latest move underneath a caller without notice. */
const MODEL_ID = 'jev-1.13.0';
export const JEV_TIMEOUT_MS = 2500;
const BACKOFF_BASE_MS = 200;
const DAY_MS = 86_400_000;
export const INORGANIC_QUESTION = "This Spotify playlist's audience is inorganic: bought followers, a bot farm, or a purchased batch of followers now being culled. Round package-sized follower counts, sudden 24-hour spikes, steady week-on-week follower losses and implausible follower-to-track ratios are warning signs. So is a large following whose tracks have near-zero Spotify popularity (a median track popularity close to 0 out of 100), because real followers play what they follow. Small personal playlists with few followers are normal and not inorganic.";
const unavailable = (reason) => ({ status: 'unavailable', reason });
/** Newest-first follower history, as days ago, so Jev reads recency directly. */
export function jevState(input, now = Date.now()) {
    const history = (input.snapshots ?? []).map(s => ({
        days_ago: Math.round(((now - Date.parse(s.snapshot_at)) / DAY_MS) * 10) / 10,
        followers: s.followers,
    }));
    const listening = trackListening(input.trackPopularity);
    return JSON.stringify({
        playlist_name: input.name ?? '',
        description: input.description ?? '',
        followers: input.followers,
        tracks: input.tracks,
        follower_history_newest_first: history,
        ...(listening && {
            median_track_popularity_0_to_100: listening.medianPopularity,
            share_of_tracks_with_popularity_5_or_less: listening.nearZeroShare,
        }),
    });
}
export function jevRequestBody(input, now = Date.now()) {
    return JSON.stringify({
        model: MODEL_ID,
        state: jevState(input, now),
        questions: { inorganic: { type: 'noul', instructions: INORGANIC_QUESTION } },
    });
}
function reasonForStatus(status) {
    if (status === 401)
        return 'auth';
    if (status === 429)
        return 'rate_limited';
    return 'error';
}
function parseAnswer(body) {
    const answer = body?.answers?.inorganic;
    const probability = answer?.noul;
    if (typeof probability !== 'number' || !(probability >= 0 && probability <= 1)) {
        return unavailable('error');
    }
    const inputTokens = body.usage?.input_tokens;
    return typeof inputTokens === 'number'
        ? { status: 'ok', probability, inputTokens }
        : { status: 'ok', probability };
}
async function settle(res) {
    if (!res.ok)
        return unavailable(reasonForStatus(res.status));
    return parseAnswer(await res.json().catch(() => null));
}
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
/** TypeSafe returns 429 (rate limit) and 529 (overloaded) as retryable. */
const isRetryableStatus = (status) => status === 429 || status === 529;
async function postWithBackoff(apiKey, body, signal, deadline, fetchImpl) {
    for (let attempt = 0;; attempt++) {
        const res = await fetchImpl(TYPESAFE_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'content-type': 'application/json',
            },
            body,
            signal,
        });
        if (!isRetryableStatus(res.status))
            return settle(res);
        const wait = BACKOFF_BASE_MS * 2 ** attempt;
        if (Date.now() + wait >= deadline)
            return unavailable(reasonForStatus(res.status));
        await sleep(wait);
    }
}
/** Never throws. Retries 429/529s only while the timeout budget allows. */
export async function askJev(input, options = {}) {
    const apiKey = options.apiKey || null;
    if (!apiKey)
        return unavailable('auth');
    const timeoutMs = options.timeoutMs ?? JEV_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await postWithBackoff(apiKey, jevRequestBody(input), controller.signal, Date.now() + timeoutMs, options.fetch ?? fetch);
    }
    catch {
        return unavailable(controller.signal.aborted ? 'timeout' : 'error');
    }
    finally {
        clearTimeout(timer);
    }
}
