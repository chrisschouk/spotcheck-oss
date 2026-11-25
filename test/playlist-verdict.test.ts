import { afterEach, describe, expect, it, vi } from 'vitest'

const askJev = vi.fn()
vi.mock('../src/jev.js', () => ({ askJev: (...args: unknown[]) => askJev(...args) }))

import { scoreWithHistory, type ScoreResult } from '../src/bot-scorer.js'
import {
  combineWithJev,
  JEV_FACTOR_LABEL,
  JEV_MIN_FOLLOWERS,
  scorePlaylist,
} from '../src/playlist-verdict.js'
import type { JevResult } from '../src/jev.js'

const clean: ScoreResult = scoreWithHistory({
  name: 'Late Night Jazz',
  description: 'Hand-picked jazz for the small hours',
  followers: 4200,
  tracks: 60,
})
const roundOnly: ScoreResult = scoreWithHistory({
  name: 'Indie Finds',
  description: 'New indie every Friday',
  followers: 20000,
  tracks: 50,
})
const high: ScoreResult = { score: 70, level: 'high', factors: [], historical: false }

const ok = (probability: number): JevResult => ({ status: 'ok', probability })

describe('combineWithJev', () => {
  it('lifts a sub-threshold playlist to medium at probability 0.3', () => {
    expect(roundOnly.score).toBe(15)
    const combined = combineWithJev(roundOnly, ok(0.3), 20000)
    expect(combined.score).toBe(25)
    expect(combined.level).toBe('medium')
    expect(combined.factors.at(-1)).toMatchObject({ label: JEV_FACTOR_LABEL, level: 'warning' })
  })

  it('lifts to high at probability 0.6 with a danger factor', () => {
    const combined = combineWithJev(roundOnly, ok(0.6), 20000)
    expect(combined.score).toBe(50)
    expect(combined.level).toBe('high')
    expect(combined.factors.at(-1)).toMatchObject({ label: JEV_FACTOR_LABEL, level: 'danger' })
  })

  it('never lowers a higher heuristic score, but adds the supporting factor', () => {
    const combined = combineWithJev(high, ok(0.35), 20000)
    expect(combined.score).toBe(70)
    expect(combined.level).toBe('high')
    expect(combined.factors.map(f => f.label)).toEqual([JEV_FACTOR_LABEL])
  })

  it('leaves the heuristic unchanged below 0.3', () => {
    expect(combineWithJev(roundOnly, ok(0.29), 20000)).toEqual(roundOnly)
  })

  it.each(['timeout', 'rate_limited', 'auth', 'no_credit', 'error'] as const)(
    'passes the heuristic through when Jev is unavailable (%s)',
    reason => {
      expect(combineWithJev(roundOnly, { status: 'unavailable', reason }, 20000)).toBe(roundOnly)
    },
  )

  it.each([0.3, 0.5, 0.59])('leaves a playlist with no heuristic warning alone at %s', p => {
    expect(clean.score).toBe(0)
    expect(combineWithJev(clean, ok(p), 4200)).toEqual(clean)
  })

  it('lifts a clean playlist to high at 0.6 and drops the "No red flags detected" placeholder', () => {
    expect(clean.factors.map(f => f.label)).toEqual(['No red flags detected'])
    const combined = combineWithJev(clean, ok(0.6), 4200)
    expect(combined.level).toBe('high')
    expect(combined.factors.map(f => f.label)).toEqual([JEV_FACTOR_LABEL])
  })

  it('leaves a 61-follower playlist low even when Jev and a weak heuristic both fire', () => {
    const tiny = scoreWithHistory({
      name: 'probably the best indie playlist ever (2)',
      description: '',
      followers: 61,
      tracks: 382,
    })
    expect(tiny.score).toBe(10)
    expect(combineWithJev(tiny, ok(0.45), 61)).toEqual(tiny)
    expect(combineWithJev(tiny, ok(0.9), 61)).toEqual(tiny)
  })

  it('lifts from exactly JEV_MIN_FOLLOWERS followers', () => {
    expect(combineWithJev(roundOnly, ok(0.3), JEV_MIN_FOLLOWERS - 1)).toEqual(roundOnly)
    expect(combineWithJev(roundOnly, ok(0.3), JEV_MIN_FOLLOWERS).level).toBe('medium')
  })
})

describe('scorePlaylist', () => {
  afterEach(() => {
    askJev.mockReset()
    vi.restoreAllMocks()
  })

  const input = { name: 'Indie Finds', description: 'New indie every Friday', followers: 20000, tracks: 50 }

  it('combines the heuristic with Jev and exposes the Jev result', async () => {
    askJev.mockResolvedValue(ok(0.45))
    const verdict = await scorePlaylist(input, { apiKey: 'test-key' })
    expect(verdict).toMatchObject({ score: 25, level: 'medium', jev: ok(0.45) })
    expect(askJev).toHaveBeenCalledWith(input, { apiKey: 'test-key' })
  })

  it('returns the heuristic when Jev is unavailable', async () => {
    askJev.mockResolvedValue({ status: 'unavailable', reason: 'timeout' })
    const verdict = await scorePlaylist(input)
    const { jev, ...rest } = verdict
    expect(rest).toEqual(scoreWithHistory(input))
    expect(jev).toEqual({ status: 'unavailable', reason: 'timeout' })
  })
})
