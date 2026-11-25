import { describe, expect, it } from 'vitest'
import {
  refAtLeast,
  trend,
  verdict,
  SPIKE_ABS,
  SPIKE_PCT,
  DROP_PCT,
  type Snap,
} from '../src/history.js'

/** Snapshots are ordered newest-first, like the DB query (snapshot_at desc). */
function snap(followers: number, agoMs: number): Snap {
  return { followers, snapshot_at: new Date(Date.now() - agoMs).toISOString() }
}

const HOUR = 3600_000
const DAY = 24 * HOUR

describe('monitoring.trend', () => {
  it('returns nulls for an empty series', () => {
    expect(trend([])).toEqual({ followers: null, change24h: null, change7d: null })
  })

  it('returns the latest follower count with null changes when nothing is old enough', () => {
    const t = trend([snap(5000, 0)])
    expect(t.followers).toBe(5000)
    expect(t.change24h).toBeNull()
    expect(t.change7d).toBeNull()
  })

  it('computes rounded 24h and 7d percentage changes', () => {
    const t = trend([
      snap(11000, 0),
      snap(10000, 25 * HOUR),
      snap(8000, 8 * DAY),
    ])
    expect(t.followers).toBe(11000)
    expect(t.change24h).toBe(10) // 1000/10000 -> +10.0%
    expect(t.change7d).toBe(37.5) // 3000/8000 -> +37.5%
  })

  it('returns null change when the reference followers are zero', () => {
    const t = trend([snap(5000, 0), snap(0, 25 * HOUR)])
    expect(t.change24h).toBeNull()
  })

  it('tolerates null followers in the series', () => {
    const t = trend([snap(5000, 0), { followers: null, snapshot_at: new Date(Date.now() - 25 * HOUR).toISOString() }])
    expect(t.followers).toBe(5000)
    expect(t.change24h).toBeNull()
  })

  it('reports a collapse to zero followers as -100%, not as no change', () => {
    // The percentage guard tested `to` for truthiness and 0 is falsy, so a
    // playlist that lost every follower reported null: the dashboard and the
    // digest both showed nothing had happened. A cull to zero is the clearest
    // purchased-follower signal there is.
    const t = trend([snap(0, 0), snap(8000, 25 * HOUR), snap(9000, 8 * DAY)])
    expect(t.followers).toBe(0)
    expect(t.change24h).toBe(-100)
    expect(t.change7d).toBe(-100)
  })
})

describe('monitoring.verdict', () => {
  it('flags a spike that crosses the absolute threshold', () => {
    // +SPIKE_ABS followers in ~24h regardless of the percentage.
    const v = verdict([snap(15000, 0), snap(15000 - SPIKE_ABS, 25 * HOUR)])
    expect(v.spike).toBe(true)
    expect(v.drop).toBe(false)
    expect(v.latest).toBe(15000)
    expect(v.ref24h).toBe(15000 - SPIKE_ABS)
  })

  it('flags a spike that crosses the percentage threshold', () => {
    const base = 10000
    const latest = Math.round(base * (1 + SPIKE_PCT / 100)) + 1
    const v = verdict([snap(latest, 0), snap(base, 25 * HOUR)])
    expect(v.spike).toBe(true)
  })

  it('does not flag a small uptick', () => {
    const v = verdict([snap(10500, 0), snap(10000, 25 * HOUR)])
    expect(v.spike).toBe(false)
  })

  it('flags a drop that crosses the percentage threshold', () => {
    const base = 10000
    const latest = Math.round(base * (1 + DROP_PCT / 100)) - 1
    const v = verdict([snap(latest, 0), snap(base, 8 * DAY)])
    expect(v.drop).toBe(true)
  })

  it('returns no verdict when the latest follower count is null', () => {
    const v = verdict([{ followers: null, snapshot_at: new Date().toISOString() }])
    expect(v.spike).toBe(false)
    expect(v.drop).toBe(false)
    expect(v.latest).toBeNull()
  })

  it('treats a single snapshot as neither spike nor drop', () => {
    const v = verdict([snap(5000, 0)])
    expect(v.spike).toBe(false)
    expect(v.drop).toBe(false)
  })
})

describe('monitoring.refAtLeast', () => {
  it('returns the first snapshot at least ms old', () => {
    const snaps = [snap(5000, 0), snap(4000, 25 * HOUR), snap(3000, 3 * DAY)]
    expect(refAtLeast(snaps, 24 * HOUR)).toBe(4000)
    expect(refAtLeast(snaps, 2 * DAY)).toBe(3000)
  })

  it('returns null when no snapshot is old enough', () => {
    expect(refAtLeast([snap(5000, 0)], 24 * HOUR)).toBeNull()
  })

  it('returns null for an empty series', () => {
    expect(refAtLeast([], 24 * HOUR)).toBeNull()
  })
})
