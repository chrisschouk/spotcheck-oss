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

import type { TrackItem } from './spotify.js'

/** An artist this small has almost no fanbase of their own to stream them. */
export const FANLESS_MAX_ARTIST_FOLLOWERS = 1_000
/** Popularity this high means real volume of recent plays. */
export const FANLESS_MIN_POPULARITY = 25
export const RECENT_ADD_DAYS = 30
export const MIN_TRACKS_FOR_SIGNALS = 10

export type StreamFarmSignals = {
  /** Tracks with a known artist follower count. */
  sampled: number
  medianPopularity: number
  medianArtistFollowers: number
  /** Share of tracks played well beyond what their artist's fanbase explains. */
  fanlessPlayShare: number
  /** Share of tracks added in the last RECENT_ADD_DAYS: placement churn. */
  recentAddShare: number
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function share(count: number, total: number): number {
  return total ? Math.round((count / total) * 100) / 100 : 0
}

function isRecent(addedAt: string | null, now: Date): boolean {
  if (!addedAt) return false
  const added = Date.parse(addedAt)
  return Number.isFinite(added) && now.getTime() - added <= RECENT_ADD_DAYS * 86_400_000
}

/** Null when too few tracks have a known artist for the shares to mean anything. */
export function streamFarmSignals(
  items: TrackItem[],
  artistFollowers: Map<string, number>,
  now: Date = new Date(),
): StreamFarmSignals | null {
  const known = items.flatMap(item => {
    const followers = item.artistId ? artistFollowers.get(item.artistId) : undefined
    return followers === undefined ? [] : [{ ...item, followers }]
  })
  if (known.length < MIN_TRACKS_FOR_SIGNALS) return null
  const fanless = known.filter(
    t => t.followers < FANLESS_MAX_ARTIST_FOLLOWERS && t.popularity >= FANLESS_MIN_POPULARITY,
  ).length
  return {
    sampled: known.length,
    medianPopularity: median(known.map(t => t.popularity)),
    medianArtistFollowers: median(known.map(t => t.followers)),
    fanlessPlayShare: share(fanless, known.length),
    recentAddShare: share(items.filter(t => isRecent(t.addedAt, now)).length, items.length),
  }
}
