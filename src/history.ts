/**
 * Follower-history maths: the latest follower count, a 24h/7d change, and a
 * spike/drop verdict over a series of snapshots.
 *
 * The scorer only uses history when a caller supplies it. Nothing in this
 * package stores snapshots; a caller that tracks followers over time can pass
 * the series in (newest first) to add the spike and drop signals.
 */

export type Snap = { followers: number | null; snapshot_at: string }

/** Spike/drop thresholds (tunable). */
export const SPIKE_PCT = 20
export const SPIKE_ABS = 5000
export const DROP_PCT = -10

/**
 * Earliest follower count that is at least `ms` old, given snapshots ordered
 * newest-first. Returns null when no snapshot is that old.
 */
export function refAtLeast(snaps: Snap[], ms: number): number | null {
  const now = Date.now()
  return snaps.find(s => now - new Date(s.snapshot_at).getTime() >= ms)?.followers ?? null
}

/**
 * Latest followers plus rounded percentage change over ~24h and ~7d. 
 */
export function trend(snaps: Snap[]): {
  followers: number | null
  change24h: number | null
  change7d: number | null
} {
  if (snaps.length === 0) return { followers: null, change24h: null, change7d: null }
  const latest = snaps[0].followers
  // `to` is compared against null rather than tested for truthiness: a playlist
  // whose followers have gone to 0 is the strongest signal the product has, and
  // a falsy check reported it as "no change" instead of -100%.
  const pct = (from: number | null, to: number | null) =>
    from != null && to != null && from > 0 ? Math.round(((to - from) / from) * 1000) / 10 : null
  return {
    followers: latest,
    change24h: pct(refAtLeast(snaps, 24 * 3600_000), latest),
    change7d: pct(refAtLeast(snaps, 7 * 24 * 3600_000), latest),
  }
}

/**
 * Spike/drop verdict, with the reference points used so a caller can quote the
 * before and after numbers.
 *   spike: +>=SPIKE_PCT% OR +>=SPIKE_ABS followers vs ~24h ago
 *   drop:  <=DROP_PCT% vs ~7 days ago
 */
export function verdict(snaps: Snap[]): {
  spike: boolean
  drop: boolean
  latest: number | null
  ref24h: number | null
  ref7d: number | null
} {
  const latest = snaps[0]?.followers ?? null
  if (latest == null) return { spike: false, drop: false, latest, ref24h: null, ref7d: null }
  const ref24h = refAtLeast(snaps, 24 * 3600_000)
  const ref7d = refAtLeast(snaps, 7 * 24 * 3600_000)
  const spike =
    ref24h != null &&
    ref24h > 0 &&
    (latest - ref24h >= SPIKE_ABS || ((latest - ref24h) / ref24h) * 100 >= SPIKE_PCT)
  const drop = ref7d != null && ref7d > 0 && ((latest - ref7d) / ref7d) * 100 <= DROP_PCT
  return { spike, drop, latest, ref24h, ref7d }
}
