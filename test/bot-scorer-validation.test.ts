/**
 * Labelled-dataset validation for the history-aware bot scorer.
 *
 * Unlike bot-scorer-v2.test.ts (which pins the arithmetic of individual
 * factors), this suite measures the scorer as a *classifier*: a corpus of
 * constructed, labelled playlist patterns (see bot-scorer-corpus.ts, where
 * every row is justified) is scored, and we compute precision / recall / F1 at a sweep of
 * thresholds. Assertions pin agreed floors so a scorer change that introduces
 * a false positive, or regresses recall, fails the build.
 *
 * What each block guards:
 *   - per-row `expectedScore`     : a regression localises to the exact row.
 *   - `expectedFactors`           : WHY each sub-threshold bot is missed.
 *   - precision/recall/F1 floors  : the agreed classifier guarantees.
 *   - threshold sweep             : the shape of the precision/recall trade-off.
 *   - boundary tests              : the scorer's tuning constants (high ratio,
 *                                   round-count, spike/drop thresholds).
 *   - calibration                 : bot vs human score separation.
 *   - committed metrics report    : the numbers in the repo can't go stale.
 */
import { readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'
import { scoreWithHistory } from '../src/bot-scorer.js'
import { CORPUS, THRESHOLDS, evaluate, renderReport, snap } from './bot-scorer-corpus.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const HOUR = 3600_000
const DAY = 24 * HOUR

/** Labels of the factors that fired, dropping the "no red flags" filler. */
function activeFactorLabels(input: Parameters<typeof scoreWithHistory>[0]): string[] {
  return scoreWithHistory(input)
    .factors.map(f => f.label)
    .filter(l => l !== 'No red flags detected')
}

/**
 * Agreed floors, keyed by threshold. These are the guarantees the scorer must
 * keep; a change that drops below any of them fails the build. Measured on this
 * corpus and set at (or just under) the current values so a regression fails
 * while a genuine improvement passes.
 *
 *   Confusion matrix on the current scorer (25 bot / 15 human):
 *     t=15  TP=24 FP=0 TN=15 FN=1  | P=100%  R=96.0% F1=98.0%
 *     t=25  TP=18 FP=0 TN=15 FN=7  | P=100%  R=72.0% F1=83.7%
 *     t=50  TP=10 FP=0 TN=15 FN=15 | P=100%  R=40.0% F1=57.1%
 */
const AGREED_FLOORS: Record<
  number,
  { minPrecision: number; exactPrecision?: number; minRecall: number; minF1: number }
> = {
  // Below the medium band: catches the +15 bots. Humans with a blank
  // description score 10 and stay under it.
  15: { minPrecision: 0.95, minRecall: 0.95, minF1: 0.95 },
  // The headline invariant: precision MUST stay 100% at the medium threshold.
  // No labelled human may score >= 25, so a scorer change that introduces a
  // false positive fails here.
  25: { minPrecision: 1, exactPrecision: 1, minRecall: 0.69, minF1: 0.82 },
  // High band: precision still perfect, recall much lower (only multi-signal
  // bots reach 50).
  50: { minPrecision: 1, exactPrecision: 1, minRecall: 0.39, minF1: 0.56 },
}

describe('bot-scorer validation corpus (labelled precision/recall)', () => {
  it('has a balanced, honestly-labelled corpus with a documented reason per row', () => {
    const bots = CORPUS.filter(r => r.label === 'bot')
    const humans = CORPUS.filter(r => r.label === 'human')
    expect(bots.length).toBeGreaterThanOrEqual(20)
    expect(humans.length).toBeGreaterThanOrEqual(12)
    // Every row must justify its label.
    for (const r of CORPUS) expect(r.why.length).toBeGreaterThan(20)
  })

  it('scores every row exactly as documented (a regression localises to the row)', () => {
    for (const r of CORPUS) {
      const { score } = scoreWithHistory(r.input)
      expect(score, `${r.name} (${r.label}) scored ${score}, expected ${r.expectedScore}`).toBe(
        r.expectedScore,
      )
    }
  })

  it('fires exactly the documented factor for each sub-threshold bot', () => {
    // Pins WHY each recall-gap bot is missed. If the scorer's attribution
    // changes (e.g. round-count starts contributing a different factor), this
    // catches it even when the aggregate metrics happen to be unaffected.
    for (const r of CORPUS.filter(r => r.expectedFactors)) {
      expect(activeFactorLabels(r.input).sort(), `factors for ${r.name}`).toEqual(
        [...r.expectedFactors!].sort(),
      )
    }
  })

  it('keeps precision at 100% at threshold 25, no labelled human reaches the medium band', () => {
    // This is what guarantees the precision floor: if any genuine curator in
    // the corpus scored >= 25 it would be a false positive. The small/new and
    // batch-add edge cases are deliberately included to stress this.
    for (const r of CORPUS.filter(r => r.label === 'human')) {
      const { score } = scoreWithHistory(r.input)
      expect(score, `${r.name} (human) scored ${score}, expected < 25`).toBeLessThan(25)
    }
  })

  for (const t of THRESHOLDS) {
    it(`meets the agreed precision/recall/F1 floors at threshold ${t}`, () => {
      const floors = AGREED_FLOORS[t]
      const m = evaluate(CORPUS, t)
      if (floors.exactPrecision != null) {
        // Exact: a single false positive here must fail the build.
        expect(m.fp, `unexpected false positives at t=${t}`).toBe(0)
        expect(m.precision).toBe(floors.exactPrecision)
      }
      expect(m.precision, `precision at t=${t}`).toBeGreaterThanOrEqual(floors.minPrecision)
      expect(m.recall, `recall at t=${t}`).toBeGreaterThanOrEqual(floors.minRecall)
      expect(m.f1, `F1 at t=${t}`).toBeGreaterThanOrEqual(floors.minF1)
    })
  }

  it('documents the precision/recall trade-off across the threshold sweep', () => {
    const sweep = THRESHOLDS.map(t => ({ t, ...evaluate(CORPUS, t) }))

    // As the threshold rises, precision must not fall and recall must not rise:
    // the classic trade-off. This pins the *shape* of the curve, so a scorer
    // change that inverts it (e.g. new false positives at a higher threshold)
    // is caught even if every individual floor still passes.
    for (let i = 1; i < sweep.length; i++) {
      expect(sweep[i].precision, `precision should not drop as threshold rises to ${sweep[i].t}`)
        .toBeGreaterThanOrEqual(sweep[i - 1].precision)
      expect(sweep[i].recall, `recall should not rise as threshold rises to ${sweep[i].t}`)
        .toBeLessThanOrEqual(sweep[i - 1].recall)
    }

    // Precision reaches a perfect 100% by threshold 25 and holds there.
    expect(sweep.find(s => s.t === 25)!.precision).toBe(1)
    expect(sweep.find(s => s.t === 50)!.precision).toBe(1)
    // Recall is strictly better at 15 than at 50, lowering the threshold does
    // recover missed bots, at the documented cost to precision.
    expect(sweep.find(s => s.t === 15)!.recall).toBeGreaterThan(sweep.find(s => s.t === 50)!.recall)
  })

  it('sizes the sub-threshold recall gap (the follower-drop and round-count-only bots the scorer misses)', () => {
    // These are the false negatives at threshold 25: real bots whose only tell
    // is a single weak signal (+10/+15). They are the reason recall is < 100%.
    // Left in on purpose, a missed bot is a finding, not a row to delete.
    const missedAt25 = CORPUS.filter(
      r => r.label === 'bot' && scoreWithHistory(r.input).score < 25,
    ).map(r => r.name)

    // The corpus deliberately expands this gap beyond the original 4 patterns
    // so recall is measured on a harder set. If a future scorer change starts
    // catching these, this count drops and the recall floors above rise ,
    // update both together, intentionally.
    expect(missedAt25.length).toBeGreaterThanOrEqual(7)

    // Each named pattern is represented among the misses.
    expect(missedAt25).toContain('Indie Discoveries Weekly') // round-count-only (+15)
    expect(missedAt25).toContain('Viral Hits Tracker') // follower-drop-only (+15)
    expect(missedAt25).toContain('Bangers Only Mix') // no-description-only (+10)
  })

  it('separates bot and human score distributions (threshold-independent calibration)', () => {
    const score = (label: 'bot' | 'human') =>
      CORPUS.filter(r => r.label === label).map(r => scoreWithHistory(r.input).score)
    const botScores = score('bot')
    const humanScores = score('human')

    const maxHuman = Math.max(...humanScores)
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

    // No human ever exceeds the top of the weak-signal band (+15). Every bot
    // that carries more than one signal clears every human outright.
    expect(maxHuman).toBeLessThanOrEqual(15)
    const confidentBots = botScores.filter(s => s >= 25)
    for (const s of confidentBots) expect(s).toBeGreaterThan(maxHuman)

    // On average bots score well above humans, a health check that survives
    // even if a single threshold's counts shift.
    expect(mean(botScores) - mean(humanScores)).toBeGreaterThanOrEqual(20)

    // The overlap that remains, bots and humans both scoring in [10, 15], IS
    // the recall gap: the scorer genuinely cannot separate a round-count/drop
    // bot from a small-but-real playlist on static signals alone.
    expect(botScores.some(s => s > 0 && s <= 15)).toBe(true)
    expect(humanScores.some(s => s > 0 && s <= 15)).toBe(true)
  })

  it('keeps the committed metrics report in sync with the corpus', () => {
    // The report is a generated artifact checked into the repo. Regenerate with
    //   UPDATE_METRICS=1 npx vitest run __tests__/lib/bot-scorer-validation.test.ts
    const reportPath = join(HERE, 'bot-scorer-metrics.md')
    const expected = renderReport()
    if (process.env.UPDATE_METRICS) {
      writeFileSync(reportPath, expected)
      return
    }
    const actual = readFileSync(reportPath, 'utf8')
    expect(
      actual,
      'bot-scorer-metrics.md is stale, run UPDATE_METRICS=1 npx vitest run to regenerate',
    ).toBe(expected)
  })
})

/**
 * Boundary tests for the scorer's tuning constants. These pin the exact tipping
 * points so that changing a constant in bot-scorer-v2.ts / monitoring.ts is a
 * visible, intentional test break rather than a silent metric drift.
 */
describe('bot-scorer tuning-constant boundaries', () => {
  const has = (input: Parameters<typeof scoreWithHistory>[0], label: string) =>
    activeFactorLabels(input).includes(label)

  it('never flags a playlist for having few followers per track', () => {
    expect(activeFactorLabels({ name: 'x', description: 'a real description here', followers: 61, tracks: 382 })).toEqual([])
    expect(activeFactorLabels({ name: 'x', description: 'a real description here', followers: 999, tracks: 5000 })).toEqual([])
  })

  it('suspiciously high ratio fires above 10,000:1 but not at exactly 10,000:1', () => {
    expect(has({ name: 'x', description: 'a real description here', followers: 10001, tracks: 1 }, 'Suspiciously high ratio')).toBe(true)
    // ratio exactly 10,000 (20000/2) -> no high-ratio flag (round-count aside).
    expect(has({ name: 'x', description: 'a real description here', followers: 20000, tracks: 2 }, 'Suspiciously high ratio')).toBe(false)
  })

  it('round follower count needs > 1000 and an exact thousand', () => {
    expect(has({ name: 'x', description: 'a real description here', followers: 2000, tracks: 500 }, 'Round follower count')).toBe(true)
    // exactly 1000 is not > 1000.
    expect(has({ name: 'x', description: 'a real description here', followers: 1000, tracks: 250 }, 'Round follower count')).toBe(false)
    // 2001 is not an exact thousand.
    expect(has({ name: 'x', description: 'a real description here', followers: 2001, tracks: 500 }, 'Round follower count')).toBe(false)
  })

  it('generic name pattern requires more than 50,000 followers', () => {
    // "chill" over the line -> flag (tracks tuned so ratio stays clean at 10).
    expect(has({ name: 'chill nights', description: 'a real description here', followers: 50001, tracks: 5000 }, 'Generic name pattern')).toBe(true)
    // exactly 50,000 is not > 50,000 (round-count aside).
    expect(has({ name: 'chill nights', description: 'a real description here', followers: 50000, tracks: 5000 }, 'Generic name pattern')).toBe(false)
  })

  it('spike fires at +5,000 absolute or +20% over ~24h, not just under', () => {
    const base = { name: 'x', description: 'a real description here', tracks: 500 }
    // +5,000 absolute (only +5%) -> spike.
    expect(has({ ...base, followers: 105000, snapshots: [snap(105000, 0), snap(100000, 25 * HOUR)] }, 'Recent follower spike')).toBe(true)
    // +4,999 absolute and < 20% -> no spike.
    expect(has({ ...base, followers: 104999, snapshots: [snap(104999, 0), snap(100000, 25 * HOUR)] }, 'Recent follower spike')).toBe(false)
    // +20% on a small base (only +200 absolute) -> spike.
    expect(has({ ...base, followers: 1200, snapshots: [snap(1200, 0), snap(1000, 25 * HOUR)] }, 'Recent follower spike')).toBe(true)
    // +19.9% -> no spike.
    expect(has({ ...base, followers: 1199, snapshots: [snap(1199, 0), snap(1000, 25 * HOUR)] }, 'Recent follower spike')).toBe(false)
  })

  it('drop fires at -10% over ~7d, not just under', () => {
    const base = { name: 'x', description: 'a real description here', tracks: 500 }
    // -10% exactly -> drop.
    expect(has({ ...base, followers: 9000, snapshots: [snap(9000, 0), snap(10000, 7 * DAY + HOUR)] }, 'Sustained follower drop')).toBe(true)
    // -9.9% -> no drop.
    expect(has({ ...base, followers: 9010, snapshots: [snap(9010, 0), snap(10000, 7 * DAY + HOUR)] }, 'Sustained follower drop')).toBe(false)
  })
})
