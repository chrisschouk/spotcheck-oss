import { describe, expect, it } from 'vitest'
import { streamFarmSignals, MIN_TRACKS_FOR_SIGNALS } from '../src/stream-farm-signals.js'
import type { TrackItem } from '../src/spotify.js'

const NOW = new Date('2026-11-05T12:00:00Z')

function track(i: number, popularity: number, addedAt = '2026-06-01T00:00:00Z'): TrackItem {
  return { popularity, artistId: `a${i}`, addedAt }
}

function followers(entries: Array<[number, number]>): Map<string, number> {
  return new Map(entries.map(([i, n]) => [`a${i}`, n]))
}

describe('streamFarmSignals', () => {
  it('returns null when too few tracks have a known artist', () => {
    const items = Array.from({ length: MIN_TRACKS_FOR_SIGNALS - 1 }, (_, i) => track(i, 40))
    const known = followers(items.map((_, i) => [i, 100]))
    expect(streamFarmSignals(items, known, NOW)).toBeNull()
  })

  it('counts tracks played well beyond their artist fanbase', () => {
    // Ten tracks: six by artists under 1,000 followers with popularity 30+, four by real acts.
    const items = Array.from({ length: 10 }, (_, i) => track(i, i < 6 ? 35 : 50))
    const known = followers(items.map((_, i) => [i, i < 6 ? 200 : 250_000]))
    const signals = streamFarmSignals(items, known, NOW)
    expect(signals).toMatchObject({ sampled: 10, fanlessPlayShare: 0.6, medianArtistFollowers: 200 })
  })

  it('does not count small artists with small plays, which is normal', () => {
    const items = Array.from({ length: 12 }, (_, i) => track(i, 8))
    const known = followers(items.map((_, i) => [i, 150]))
    expect(streamFarmSignals(items, known, NOW)?.fanlessPlayShare).toBe(0)
  })

  it('measures the share of tracks added in the last 30 days', () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      track(i, 20, i < 4 ? '2026-10-20T00:00:00Z' : '2026-01-01T00:00:00Z'),
    )
    const known = followers(items.map((_, i) => [i, 5_000]))
    expect(streamFarmSignals(items, known, NOW)?.recentAddShare).toBe(0.4)
  })

  it('skips tracks whose artist follower count is unknown', () => {
    const items = [...Array.from({ length: 10 }, (_, i) => track(i, 30)), { popularity: 90, artistId: null, addedAt: null }]
    const known = followers(Array.from({ length: 10 }, (_, i) => [i, 50_000]))
    expect(streamFarmSignals(items, known, NOW)).toMatchObject({ sampled: 10, medianPopularity: 30 })
  })
})
