import { describe, expect, it } from 'vitest'
import {
  LISTENING_MAX_MEDIAN_POPULARITY,
  LISTENING_MIN_FOLLOWERS,
  LISTENING_MIN_TRACKS_SAMPLED,
  LOW_LISTENING_LABEL,
  NO_RED_FLAGS_LABEL,
  scoreWithHistory,
  trackListening,
} from '../src/bot-scorer.js'
import type { Snap } from '../src/history.js'

/** Snapshots are ordered newest-first, like the DB query (snapshot_at desc). */
function snap(followers: number, agoMs: number): Snap {
  return { followers, snapshot_at: new Date(Date.now() - agoMs).toISOString() }
}

const HOUR = 3600_000
const DAY = 24 * HOUR

describe('bot-scorer-v2.scoreWithHistory', () => {
  it('marks historical=false and matches pure static heuristics when no series', () => {
    // Clean profile, no snapshots: identical to the static scorer (no flags).
    const clean = scoreWithHistory({
      name: 'Quiet Storm, Saturday Editorial',
      description: 'Curated by a real human, refreshed weekly. Submit via email.',
      followers: 4321,
      tracks: 87,
    })
    expect(clean.historical).toBe(false)
    expect(clean.score).toBe(0)
    expect(clean.level).toBe('low')
    expect(clean.factors).toHaveLength(1)
    expect(clean.factors[0].label).toBe('No red flags detected')

    // A round-number profile scores exactly the static contribution (15).
    const round = scoreWithHistory({
      name: 'Indie Mix 2026',
      description: 'A real description that exists.',
      followers: 25000,
      tracks: 200,
    })
    expect(round.historical).toBe(false)
    expect(round.score).toBe(15)
    expect(round.factors.map(f => f.label)).toContain('Round follower count')
  })

  it('treats a single snapshot as non-historical', () => {
    const result = scoreWithHistory({
      name: 'Indie Mix',
      description: 'A real description that exists here.',
      followers: 4321,
      tracks: 87,
      snapshots: [snap(4321, 0)],
    })
    expect(result.historical).toBe(false)
    expect(result.factors.map(f => f.label)).not.toContain('Recent follower spike')
  })

  it('a spike series yields historical=true, a spike factor and a higher score', () => {
    // +50% jump vs ~24h ago, well over the spike threshold.
    const spike: Snap[] = [
      snap(15000, 0),
      snap(10000, 25 * HOUR),
      snap(9800, 3 * DAY),
    ]
    const withHistory = scoreWithHistory({
      name: 'Indie Mix',
      description: 'A real description that exists here.',
      followers: 15000,
      tracks: 200,
      snapshots: spike,
    })
    const withoutHistory = scoreWithHistory({
      name: 'Indie Mix',
      description: 'A real description that exists here.',
      followers: 15000,
      tracks: 200,
    })

    expect(withHistory.historical).toBe(true)
    expect(withHistory.factors.map(f => f.label)).toContain('Recent follower spike')
    expect(withHistory.score).toBeGreaterThan(withoutHistory.score)
    // Static contribution here is 0, +25 spike pushes into the medium band.
    expect(withHistory.level).toBe('medium')
  })

  it('a spike compounding with static flags lands in the high band', () => {
    const spike: Snap[] = [snap(50000, 0), snap(10000, 25 * HOUR)]
    const result = scoreWithHistory({
      name: 'chill vibes',
      description: '',
      followers: 50000,
      tracks: 4, // ratio 12500 -> suspiciously high (+25)
      snapshots: spike,
    })
    expect(result.historical).toBe(true)
    expect(result.level).toBe('high')
    expect(result.score).toBeGreaterThanOrEqual(50)
    const labels = result.factors.map(f => f.label)
    expect(labels).toContain('Recent follower spike')
    expect(labels).toContain('Suspiciously high ratio')
  })

  it('a steady weekly drop adds a medium drop factor', () => {
    const drop: Snap[] = [
      snap(8800, 0),
      snap(9500, 3 * DAY),
      snap(10000, 7 * DAY + HOUR),
    ]
    const result = scoreWithHistory({
      name: 'Indie Mix',
      description: 'A real description that exists here.',
      followers: 8800,
      tracks: 200,
      snapshots: drop,
    })
    expect(result.historical).toBe(true)
    expect(result.factors.map(f => f.label)).toContain('Sustained follower drop')
    expect(result.score).toBeGreaterThanOrEqual(15)
  })

  it('caps the score at 100', () => {
    const spike: Snap[] = [snap(9999999000, 0), snap(10000, 25 * HOUR)]
    const result = scoreWithHistory({
      name: 'chill vibes lofi study sleep workout',
      description: '',
      followers: 9999999000,
      tracks: 1,
      snapshots: spike,
    })
    expect(result.score).toBeLessThanOrEqual(100)
  })

  it('respects the band thresholds', () => {
    // Clean, non-round followers -> no flags -> low.
    expect(
      scoreWithHistory({
        name: 'Real Curator Mix',
        description: 'A genuine human-written description.',
        followers: 100123,
        tracks: 100,
      }).level,
    ).toBe('low')
    // No description (+10) only -> still low.
    expect(
      scoreWithHistory({
        name: 'Real Curator Mix',
        description: '',
        followers: 100123,
        tracks: 100,
      }).level,
    ).toBe('low')
  })
})

describe('bot-scorer-v2 listening signal', () => {
  const described = { name: 'Focus Flow', description: 'Calm instrumentals for deep work', tracks: 300 }
  const pops = (median: number) => [...Array(20).fill(0), ...Array(21).fill(median), ...Array(20).fill(90)]
  const flagged = (followers: number, trackPopularity?: number[]) =>
    scoreWithHistory({ ...described, followers, trackPopularity }).factors.some(
      f => f.label === LOW_LISTENING_LABEL,
    )

  it('flags a large following whose typical track sits at popularity 5 or below', () => {
    expect(flagged(LISTENING_MIN_FOLLOWERS, pops(LISTENING_MAX_MEDIAN_POPULARITY))).toBe(true)
    const result = scoreWithHistory({ ...described, followers: 191_143, trackPopularity: pops(0) })
    expect(result).toMatchObject({ score: 25, level: 'medium' })
  })

  it('does not flag just above the median or just under the follower floor', () => {
    expect(flagged(LISTENING_MIN_FOLLOWERS, pops(LISTENING_MAX_MEDIAN_POPULARITY + 1))).toBe(false)
    expect(flagged(LISTENING_MIN_FOLLOWERS - 1, pops(0))).toBe(false)
  })

  it('needs enough sampled tracks, and treats missing popularity as no evidence', () => {
    expect(flagged(50_000, Array(LISTENING_MIN_TRACKS_SAMPLED - 1).fill(0))).toBe(false)
    expect(flagged(50_000, Array(LISTENING_MIN_TRACKS_SAMPLED).fill(0))).toBe(true)
    expect(flagged(50_000, undefined)).toBe(false)
    expect(flagged(50_000, [])).toBe(false)
  })
})

describe('bot-scorer-v2 large genuine playlists', () => {
  // Lofi Girl's official playlist as /api/check read it on 23 Sep 2026.
  const lofiGirl = {
    name: 'Lofi Girl - beats to relax/study to',
    description: 'A daily selection of chill beats - perfect to help you relax & study',
    followers: 7_128_100,
    tracks: 500,
    trackPopularity: [
      53, 49, 55, 52, 52, 50, 54, 55, 54, 51, 52, 49, 51, 53, 54, 55, 53, 55, 52, 55, 57, 52, 52, 54, 53,
      50, 53, 53, 51, 53, 45, 54, 50, 48, 52, 49, 53, 52, 51, 48, 51, 54, 51, 52, 52, 56, 54, 52, 55, 53,
      52, 51, 53, 52, 47, 52, 51, 53, 48, 49, 54, 55, 54, 52, 51, 53, 52, 56, 54, 52, 57, 51, 48, 53, 51,
      51, 58, 51, 54, 53, 53, 54, 55, 50, 50, 55, 53, 50, 52, 52, 53, 50, 44, 46, 55, 55, 57, 50, 55, 51,
    ],
  }

  it('does not flag a huge, heavily played brand playlist', () => {
    expect(scoreWithHistory(lofiGirl)).toMatchObject({
      score: 0,
      level: 'low',
      factors: [{ label: NO_RED_FLAGS_LABEL }],
    })
  })

  it('still flags the same shape when its tracks are barely played', () => {
    const quiet = { ...lofiGirl, trackPopularity: lofiGirl.trackPopularity.map(() => 2) }
    expect(scoreWithHistory(quiet).level).toBe('high')
  })

  it('still flags the ratio and name when too few tracks were sampled to judge listening', () => {
    const fewTracks = { ...lofiGirl, tracks: 12, trackPopularity: lofiGirl.trackPopularity.slice(0, 12) }
    expect(scoreWithHistory(fewTracks)).toMatchObject({ score: 35, level: 'medium' })
  })
})

describe('trackListening', () => {
  it('takes the median and the share at popularity 5 or below', () => {
    expect(trackListening([...Array(10).fill(5), ...Array(10).fill(6)])).toEqual({
      medianPopularity: 5.5,
      nearZeroShare: 0.5,
      sampled: 20,
    })
  })
})
