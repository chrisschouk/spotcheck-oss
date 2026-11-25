/**
 * Follower-history maths: the latest follower count, a 24h/7d change, and a
 * spike/drop verdict over a series of snapshots.
 *
 * The scorer only uses history when a caller supplies it. Nothing in this
 * package stores snapshots; a caller that tracks followers over time can pass
 * the series in (newest first) to add the spike and drop signals.
 */
export type Snap = {
    followers: number | null;
    snapshot_at: string;
};
/** Spike/drop thresholds (tunable). */
export declare const SPIKE_PCT = 20;
export declare const SPIKE_ABS = 5000;
export declare const DROP_PCT = -10;
/**
 * Earliest follower count that is at least `ms` old, given snapshots ordered
 * newest-first. Returns null when no snapshot is that old.
 */
export declare function refAtLeast(snaps: Snap[], ms: number): number | null;
/**
 * Latest followers plus rounded percentage change over ~24h and ~7d.
 */
export declare function trend(snaps: Snap[]): {
    followers: number | null;
    change24h: number | null;
    change7d: number | null;
};
/**
 * Spike/drop verdict, with the reference points used so a caller can quote the
 * before and after numbers.
 *   spike: +>=SPIKE_PCT% OR +>=SPIKE_ABS followers vs ~24h ago
 *   drop:  <=DROP_PCT% vs ~7 days ago
 */
export declare function verdict(snaps: Snap[]): {
    spike: boolean;
    drop: boolean;
    latest: number | null;
    ref24h: number | null;
    ref7d: number | null;
};
