/**
 * Shared labelled corpus + metrics helpers for the bot-scorer validation suite.
 *
 * This is NOT a test file (no `*.test.ts`), it is imported by
 * bot-scorer-validation.test.ts and by the committed metrics report so both
 * read from a single source of truth. See that test file for the assertion
 * strategy; this module owns the data and the maths.
 *
 * Every row is constructed, not observed: the names, counts and histories are
 * written to represent a known pattern, and none is a real Spotify playlist. It
 * tests that the scorer does what we designed it to do on those patterns. It
 * says nothing about accuracy on real playlists.
 *
 * Labelling policy:
 *   - `bot`   = a pattern a human analyst would call inorganic: purchased
 *               followers (round packages, 24h spikes), culled batches
 *               (week-on-week drops), or bot-farm ratios.
 *   - `human` = a genuine curator, including small/new playlists and
 *               batch-adders with few followers per track.
 *
 * The interesting failure this corpus is built to expose is the RECALL gap:
 * bots whose only tell is a single weak signal (a round follower count, or a
 * sustained drop, each worth +15; a bare missing description, +10) score below
 * the medium threshold of 25 and are missed. Those rows are labelled `bot` and
 * left in, a missed bot is a finding, not a row to delete.
 *
 * `expectedScore` on every row makes a regression localise to the exact
 * playlist rather than only shifting the aggregate metrics. `expectedFactors`,
 * where present, pins WHY a sub-threshold bot is missed (which single factor
 * fired), so a change to the scorer's factor attribution is caught too.
 */
import { scoreWithHistory, type ScoreInput } from '../src/bot-scorer.js'
import type { Snap } from '../src/history.js'

const HOUR = 3600_000
const DAY = 24 * HOUR

/** Snapshots are ordered newest-first, like the DB query (snapshot_at desc). */
export function snap(followers: number, agoMs: number): Snap {
  return { followers, snapshot_at: new Date(Date.now() - agoMs).toISOString() }
}

/** A ~24h follower spike (older -> newer), enough to trip verdict().spike. */
export function spikeSeries(from: number, to: number): Snap[] {
  return [snap(to, 0), snap(from, 25 * HOUR), snap(from, 3 * DAY)]
}

/** A week-on-week decline, enough to trip verdict().drop but never spike. */
export function dropSeries(from: number, to: number): Snap[] {
  return [snap(to, 0), snap(Math.round((from + to) / 2), 3 * DAY), snap(from, 7 * DAY + HOUR)]
}

export type Label = 'bot' | 'human'
export type Row = {
  name: string
  label: Label
  why: string
  /** The score the current scorer must produce for this row (localises regressions). */
  expectedScore: number
  /** For sub-threshold bots: the exact set of factor labels that must fire. */
  expectedFactors?: string[]
  input: ScoreInput
}

/**
 * The labelled corpus. Every row carries a one-line justification for its
 * label and the score the scorer must produce. Grouped by the pattern each row
 * is meant to represent so the distribution stays legible.
 */
export const CORPUS: Row[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // BOTS, strongly inorganic, expected to score in the medium/high bands.
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: 'chill vibes 24/7',
    label: 'bot',
    why: 'Generic name, blank desc, 3 tracks for 60k followers (ratio 20k), round count, textbook purchased playlist.',
    expectedScore: 60,
    input: { name: 'chill vibes 24/7', description: '', followers: 60000, tracks: 3 },
  },
  {
    name: 'lofi beats to study to',
    label: 'bot',
    why: 'Generic name + blank desc + absurd ratio + round count + a 24h follower spike layered on top.',
    expectedScore: 85,
    input: {
      name: 'lofi beats to study to',
      description: '',
      followers: 80000,
      tracks: 5,
      snapshots: spikeSeries(40000, 80000),
    },
  },
  {
    name: 'sleep sounds deluxe',
    label: 'bot',
    why: 'Generic "sleep" name over 50k, blank desc, 4 tracks / 100k followers, round count.',
    expectedScore: 60,
    input: { name: 'sleep sounds deluxe', description: '', followers: 100000, tracks: 4 },
  },
  {
    name: 'workout hits pumped',
    label: 'bot',
    why: 'Generic "workout" name, blank desc, ratio 27.5k, round 55k count.',
    expectedScore: 60,
    input: { name: 'workout hits pumped', description: '', followers: 55000, tracks: 2 },
  },
  {
    name: 'Top 100 Global Now',
    label: 'bot',
    why: 'Blank desc, 10 tracks / 200k followers (ratio 20k), round count, inflated aggregator.',
    expectedScore: 50,
    input: { name: 'Top 100 Global Now', description: '', followers: 200000, tracks: 10 },
  },
  {
    name: 'EDM Festival Anthems',
    label: 'bot',
    why: 'Blank desc, ratio 30k, round count AND a 24h spike from 50k to 150k.',
    expectedScore: 75,
    input: {
      name: 'EDM Festival Anthems',
      description: '',
      followers: 150000,
      tracks: 5,
      snapshots: spikeSeries(50000, 150000),
    },
  },
  {
    name: 'RapCaviar (unofficial)',
    label: 'bot',
    why: 'Blank desc, 2 tracks / 75k followers (ratio 37.5k), round count.',
    expectedScore: 50,
    input: { name: 'RapCaviar (unofficial)', description: '', followers: 75000, tracks: 2 },
  },
  {
    name: 'Pop Rising Hourly',
    label: 'bot',
    why: 'Blank desc, ratio 30k, round count, spike 50k -> 90k in a day.',
    expectedScore: 75,
    input: {
      name: 'Pop Rising Hourly',
      description: '',
      followers: 90000,
      tracks: 3,
      snapshots: spikeSeries(50000, 90000),
    },
  },
  {
    name: 'Gym Motivation Beast',
    label: 'bot',
    why: 'Blank desc, ratio 16k, round 65k count.',
    expectedScore: 50,
    input: { name: 'Gym Motivation Beast', description: '', followers: 65000, tracks: 4 },
  },
  {
    name: 'Underground Rap Vault',
    label: 'bot',
    why: 'Round count plus a +200% follower spike overnight. The stuffed tracklist (ratio 7.5) is not a signal.',
    expectedScore: 40,
    input: {
      name: 'Underground Rap Vault',
      description: 'The best underground hip hop tracks around town',
      followers: 3000,
      tracks: 400,
      snapshots: spikeSeries(1000, 3000),
    },
  },
  {
    name: 'New Music Friday Unofficial',
    label: 'bot',
    why: 'Round count + a 24h spike (9k -> 12k). Has a filler desc but the history gives it away.',
    expectedScore: 40,
    input: {
      name: 'New Music Friday Unofficial',
      description: 'Fresh tracks added every week right here now',
      followers: 12000,
      tracks: 600,
      snapshots: spikeSeries(9000, 12000),
    },
  },
  {
    name: 'Deep Focus Instrumental',
    label: 'bot',
    why: '1 track / 20,001 followers = ratio 20k, suspiciously high with nothing else on the profile.',
    expectedScore: 25,
    input: {
      name: 'Deep Focus Instrumental',
      description: 'Instrumental focus playlist for deep work sessions',
      followers: 20001,
      tracks: 1,
    },
  },
  {
    name: 'Acoustic Covers Daily',
    label: 'bot',
    why: '1 track / 22k followers (ratio 22k) and a round count.',
    expectedScore: 40,
    input: {
      name: 'Acoustic Covers Daily',
      description: 'Beautiful acoustic covers of popular songs today',
      followers: 22000,
      tracks: 1,
    },
  },
  {
    name: 'Throwback Thursdays Vol 9',
    label: 'bot',
    why: 'Round count + a +200% overnight spike (2k -> 6k).',
    expectedScore: 40,
    input: {
      name: 'Throwback Thursdays Vol 9',
      description: 'Nostalgic throwback tracks every single week here',
      followers: 6000,
      tracks: 300,
      snapshots: spikeSeries(2000, 6000),
    },
  },
  {
    name: 'Coding Music Marathon',
    label: 'bot',
    why: 'Round 11k count plus a 24h spike (8k -> 11k).',
    expectedScore: 40,
    input: {
      name: 'Coding Music Marathon',
      description: 'Focus music for long coding sessions and nights',
      followers: 11000,
      tracks: 2,
      snapshots: spikeSeries(8000, 11000),
    },
  },
  {
    name: 'Hype House Anthems',
    label: 'bot',
    why: 'Mass-added 500 tracks for 400 followers plus an overnight spike from 100. Only the spike fires; the low ratio is not a signal.',
    expectedScore: 25,
    input: {
      name: 'Hype House Anthems',
      description: 'The hottest tracks from your favourite creators',
      followers: 400,
      tracks: 500,
      snapshots: spikeSeries(100, 400),
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // BOTS, SUB-THRESHOLD recall gap. Genuinely inorganic but only trip ONE
  // weak signal (round count OR drop OR bare no-description = +10/+15), so
  // they land under the medium threshold of 25 and are MISSED. Labelled
  // honestly as bots; these are the false negatives the corpus exists to size.
  // `expectedFactors` pins which single factor fires for each.
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: 'Indie Discoveries Weekly',
    label: 'bot',
    why: 'Round 10k follower package, ratio exactly 10 (no flag), plausible desc, only the round count fires (+15).',
    expectedScore: 15,
    expectedFactors: ['Round follower count'],
    input: {
      name: 'Indie Discoveries Weekly',
      description: 'Curated indie tracks updated regularly right here',
      followers: 10000,
      tracks: 1000,
    },
  },
  {
    name: 'Road Trip Classics',
    label: 'bot',
    why: 'Round 5k purchased count, ratio 10, has a desc, only round count fires (+15).',
    expectedScore: 15,
    expectedFactors: ['Round follower count'],
    input: {
      name: 'Road Trip Classics',
      description: 'Classic road trip anthems for the long summer',
      followers: 5000,
      tracks: 500,
    },
  },
  {
    name: 'Chillhop Cafe Corner',
    label: 'bot',
    why: 'Round 2k count, ratio 10, desc present, round count only (+15).',
    expectedScore: 15,
    expectedFactors: ['Round follower count'],
    input: {
      name: 'Chillhop Cafe Corner',
      description: 'Relaxing chillhop beats for your slow afternoon',
      followers: 2000,
      tracks: 200,
    },
  },
  {
    name: 'Viral Hits Tracker',
    label: 'bot',
    why: 'Followers being culled: 10k -> 8.8k over a week (-12%). Non-round, ratio 11, only the drop fires (+15).',
    expectedScore: 15,
    expectedFactors: ['Sustained follower drop'],
    input: {
      name: 'Viral Hits Tracker',
      description: 'Trending viral songs updated daily just for you',
      followers: 8800,
      tracks: 800,
      snapshots: dropSeries(10000, 8800),
    },
  },
  {
    name: 'Fresh Finds Web',
    label: 'bot',
    why: 'Purchased batch being culled: 20k -> 17.3k over a week (-13.5%). Non-round count, ratio 17, only the drop fires (+15).',
    expectedScore: 15,
    expectedFactors: ['Sustained follower drop'],
    input: {
      name: 'Fresh Finds Web',
      description: 'Weekly fresh music finds from around the web',
      followers: 17300,
      tracks: 1000,
      snapshots: dropSeries(20000, 17300),
    },
  },
  {
    name: 'Bedroom Pop Dreams',
    label: 'bot',
    why: 'Culled batch: 11.5k -> 9.2k over a week (-20%). Non-round count, ratio 10.2, only the drop fires (+15).',
    expectedScore: 15,
    expectedFactors: ['Sustained follower drop'],
    input: {
      name: 'Bedroom Pop Dreams',
      description: 'Lo-fi bedroom pop and dream pop selections here',
      followers: 9200,
      tracks: 900,
      snapshots: dropSeries(11500, 9200),
    },
  },
  {
    name: 'Bangers Only Mix',
    label: 'bot',
    why: 'Blank desc is the sole tell (+10); healthy ratio and non-round count. Slips under threshold.',
    expectedScore: 10,
    expectedFactors: ['No description'],
    input: { name: 'Bangers Only Mix', description: '', followers: 4321, tracks: 87 },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // HUMANS, clean curators. Expected to score 0 (no signals).
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: 'Saturday Morning Coffee',
    label: 'human',
    why: 'Healthy 49:1 ratio, real desc, non-round count, a genuine mellow-mornings curator.',
    expectedScore: 0,
    input: {
      name: 'Saturday Morning Coffee',
      description: 'Hand-picked mellow tracks for slow weekend mornings',
      followers: 4321,
      tracks: 87,
    },
  },
  {
    name: 'Dad Rock Essentials',
    label: 'human',
    why: 'Long-running personal playlist, healthy ratio, heartfelt desc.',
    expectedScore: 0,
    input: {
      name: 'Dad Rock Essentials',
      description: 'The rock classics my father raised me on, all here',
      followers: 12873,
      tracks: 412,
    },
  },
  {
    name: 'Quiet Storm, Saturday Editorial',
    label: 'human',
    why: 'Editorial-style human playlist, real desc, healthy ratio, non-round count.',
    expectedScore: 0,
    input: {
      name: 'Quiet Storm, Saturday Editorial',
      description: 'Curated by a real human, refreshed weekly. Submit via email.',
      followers: 4321,
      tracks: 87,
    },
  },
  {
    name: 'Sunday Kitchen Jazz',
    label: 'human',
    why: 'Modest cosy playlist, healthy ratio, real desc.',
    expectedScore: 0,
    input: {
      name: 'Sunday Kitchen Jazz',
      description: 'Warm jazz standards for cooking on a lazy Sunday',
      followers: 2612,
      tracks: 143,
    },
  },
  {
    name: 'Half-Light Ambient',
    label: 'human',
    why: 'Niche ambient curator, real desc, healthy ratio, non-round count.',
    expectedScore: 0,
    input: {
      name: 'Half-Light Ambient',
      description: 'Slow ambient washes for reading late into the night',
      followers: 9187,
      tracks: 254,
    },
  },
  {
    name: 'Northern Soul 45s',
    label: 'human',
    why: 'Specialist vinyl-nerd playlist, strong ratio, detailed desc.',
    expectedScore: 0,
    input: {
      name: 'Northern Soul 45s',
      description: 'Rare northern soul seven-inches, all killer no filler',
      followers: 33127,
      tracks: 289,
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // HUMANS: small, new and batch-added playlists with few followers per track.
  // They once tripped a low-ratio rule that has since been removed, and stay
  // here to prove small organic playlists score low. Two carry a blank
  // description (+10), the only static signal a real curator still trips.
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: 'Wedding Reception 2025',
    label: 'human',
    why: 'Small legit event playlist: 87 followers / 64 tracks = ratio 1.4 but obviously real.',
    expectedScore: 0,
    input: {
      name: 'Wedding Reception 2025',
      description: 'Songs for our big day, crowd pleasers all night long',
      followers: 87,
      tracks: 64,
    },
  },
  {
    name: 'My Kid’s Bedtime Songs',
    label: 'human',
    why: 'Tiny personal playlist: 12 followers / 30 tracks, a parent, not a bot.',
    expectedScore: 0,
    input: {
      name: 'My Kid’s Bedtime Songs',
      description: 'Gentle lullabies and calm songs for winding down',
      followers: 12,
      tracks: 30,
    },
  },
  {
    name: 'New Curator First Playlist',
    label: 'human',
    why: 'Brand-new curator: 40 followers / 25 tracks with a real intro desc.',
    expectedScore: 0,
    input: {
      name: 'New Curator First Playlist',
      description: 'Just starting out, sharing the songs I love most',
      followers: 40,
      tracks: 25,
    },
  },
  {
    name: 'Local Gig Warmups',
    label: 'human',
    why: 'Small scene playlist: 210 followers / 120 tracks but a real local-music curator.',
    expectedScore: 0,
    input: {
      name: 'Local Gig Warmups',
      description: 'Tracks we spin before shows at the local venue',
      followers: 210,
      tracks: 120,
    },
  },
  {
    name: 'Crate Digger’s Archive',
    label: 'human',
    why: 'Batch-adder: dumped 1,800 finds, only 900 followers (ratio 0.5), obsessive real curator.',
    expectedScore: 0,
    input: {
      name: 'Crate Digger’s Archive',
      description: 'Everything I have unearthed digging through the crates',
      followers: 900,
      tracks: 1800,
    },
  },
  {
    name: 'Film Score Deep Cuts',
    label: 'human',
    why: 'Batch-adder: 2,400 tracks for 5.1k followers (ratio ~2), a soundtrack completist.',
    expectedScore: 0,
    input: {
      name: 'Film Score Deep Cuts',
      description: 'Obscure film and TV score cues I keep collecting',
      followers: 5100,
      tracks: 2400,
    },
  },
  {
    name: 'Running Playlist (no notes)',
    label: 'human',
    why: 'Real runner who never wrote a description (+10) but has a healthy ratio and non-round count.',
    expectedScore: 10,
    input: { name: 'Running Playlist (no notes)', description: '', followers: 1873, tracks: 96 },
  },
  {
    name: 'Commute Mix',
    label: 'human',
    why: 'Left the description blank (+10); otherwise a perfectly ordinary personal playlist.',
    expectedScore: 10,
    input: { name: 'Commute Mix', description: '', followers: 642, tracks: 58 },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TRACK POPULARITY, the only rows carrying a listening sample. A heavily
  // played playlist is exempt from the ratio and generic-name guesses; these
  // rows prove the exemption frees the genuine brand playlist and no bot.
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: 'Lofi Brand Official',
    label: 'human',
    why: 'Modelled on Lofi Girl as read on 23 Sep 2026: 7.1M followers / 500 tracks (ratio 14k) and a lofi name, but its tracks sit at popularity ~52.',
    expectedScore: 0,
    input: {
      name: 'Lofi Brand - beats to relax/study to',
      description: 'A daily selection of chill beats to help you relax and study',
      followers: 7_128_100,
      tracks: 500,
      trackPopularity: Array(100).fill(52),
    },
  },
  {
    name: 'lofi study beats 24/7',
    label: 'bot',
    why: 'Bought followers on a lofi name: 412k followers / 30 tracks (ratio 13.7k) and nobody plays the tracks (popularity 1). Low listening keeps the ratio flag live.',
    expectedScore: 60,
    input: {
      name: 'lofi study beats 24/7',
      description: 'Relaxing lofi beats for studying and sleeping',
      followers: 412_387,
      tracks: 30,
      trackPopularity: Array(30).fill(1),
    },
  },
  {
    name: 'Chart Hits Right Now',
    label: 'bot',
    why: 'Bought followers on 12 chart hits (popularity 85): 150k followers (ratio 12.5k), blank desc. Too few tracks to judge listening, so the ratio flag stands.',
    expectedScore: 35,
    input: {
      name: 'Chart Hits Right Now',
      description: '',
      followers: 150_321,
      tracks: 12,
      trackPopularity: Array(12).fill(85),
    },
  },
]

export const THRESHOLDS = [15, 25, 50] as const

export type Confusion = { tp: number; fp: number; tn: number; fn: number }
export type Metrics = Confusion & { precision: number; recall: number; f1: number }

/** Confusion matrix + precision/recall/F1 for "predict bot when score >= threshold". */
export function evaluate(rows: Row[], threshold: number): Metrics {
  const c: Confusion = { tp: 0, fp: 0, tn: 0, fn: 0 }
  for (const row of rows) {
    const predictedBot = scoreWithHistory(row.input).score >= threshold
    if (row.label === 'bot') predictedBot ? c.tp++ : c.fn++
    else predictedBot ? c.fp++ : c.tn++
  }
  const precision = c.tp + c.fp === 0 ? 1 : c.tp / (c.tp + c.fp)
  const recall = c.tp + c.fn === 0 ? 1 : c.tp / (c.tp + c.fn)
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
  return { ...c, precision, recall, f1 }
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`

/**
 * Render the metrics report as deterministic markdown (no timestamps, so it is
 * stable to commit and diff). The validation suite regenerates this and asserts
 * the committed copy matches, so the numbers in the repo can never go stale.
 */
export function renderReport(): string {
  const bots = CORPUS.filter(r => r.label === 'bot')
  const humans = CORPUS.filter(r => r.label === 'human')
  const lines: string[] = []
  lines.push('# Bot-scorer validation metrics')
  lines.push('')
  lines.push(
    '<!-- GENERATED FILE, do not edit by hand. Regenerate with:',
    '     UPDATE_METRICS=1 npx vitest run __tests__/lib/bot-scorer-validation.test.ts -->',
  )
  lines.push('')
  lines.push(
    `Computed from the constructed (synthetic) labelled corpus in \`bot-scorer-corpus.ts\` ` +
      `(${CORPUS.length} rows: ${bots.length} bot / ${humans.length} human), scoring each ` +
      'playlist with `scoreWithHistory` and predicting "bot" when the score meets the threshold.',
  )
  lines.push('')
  lines.push('## Confusion matrix and metrics at each threshold')
  lines.push('')
  lines.push('| Threshold | TP | FP | TN | FN | Precision | Recall | F1 |')
  lines.push('| --------: | -: | -: | -: | -: | --------: | -----: | -: |')
  for (const t of THRESHOLDS) {
    const m = evaluate(CORPUS, t)
    lines.push(
      `| ${t} | ${m.tp} | ${m.fp} | ${m.tn} | ${m.fn} | ${pct(m.precision)} | ${pct(m.recall)} | ${pct(m.f1)} |`,
    )
  }
  lines.push('')
  lines.push('## Sub-threshold bots (the recall gap, missed at threshold 25)')
  lines.push('')
  lines.push('Real bots whose only tell is a single weak signal, so they score below the medium band:')
  lines.push('')
  for (const r of bots) {
    const s = scoreWithHistory(r.input).score
    if (s < 25) lines.push(`- **${s}**, ${r.name}: ${r.why}`)
  }
  lines.push('')
  lines.push('## Human edge cases that score above zero')
  lines.push('')
  lines.push('Genuine curators that trip a single static heuristic but stay below threshold 25:')
  lines.push('')
  for (const r of humans) {
    const s = scoreWithHistory(r.input).score
    if (s > 0) lines.push(`- **${s}**, ${r.name}: ${r.why}`)
  }
  lines.push('')
  return lines.join('\n')
}
