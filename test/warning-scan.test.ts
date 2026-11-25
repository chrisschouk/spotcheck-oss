import { describe, expect, it } from 'vitest'
import {
  CLEAN_REASON,
  MAX_SCAN_LINKS,
  buildReport,
  distributorReply,
  orderRows,
  parseScanInput,
  reasonFor,
  removalRequest,
  type FullRow,
  type ScoredRow,
} from '../src/warning-scan.js'

const A = '1PmwMQY86pJuAm7veFt3u2'
const B = '5oX3PmY6QeF6mmVDSCbQ4Z'
const C = '3cEYpjA9oz9GiPac4AsH4n'

function id(n: number): string {
  return `x${String(n).padStart(21, '0')}`
}

function scored(overrides: Partial<ScoredRow> = {}): ScoredRow {
  return {
    kind: 'scored',
    playlistId: A,
    url: `https://open.spotify.com/playlist/${A}`,
    name: 'Chill Vibes',
    owner: 'Curator Co',
    followers: 60000,
    tracks: 2,
    score: 70,
    level: 'high',
    reason: 'Suspiciously high ratio',
    ...overrides,
  }
}

const BLANK = { artistName: '', trackName: '', distributor: '' }
const FILLED = { artistName: 'Sam Rivers', trackName: 'Low Tide', distributor: 'DistroKid' }

describe('parseScanInput', () => {
  it('reads URLs and URIs split by newlines, commas and spaces', () => {
    const text = `https://open.spotify.com/playlist/${A}?si=abc123,spotify:playlist:${B}\n\n  https://open.spotify.com/intl-de/playlist/${C}`
    expect(parseScanInput(text)).toEqual({ ids: [A, B, C], skipped: [], overCap: 0 })
  })

  it('keeps the first of each duplicate and reports the rest', () => {
    const parsed = parseScanInput(`${A}\nhttps://open.spotify.com/playlist/${A}`)
    expect(parsed.ids).toEqual([A])
    expect(parsed.skipped).toEqual([
      { kind: 'skipped', input: `https://open.spotify.com/playlist/${A}`, playlistId: A, why: 'duplicate' },
    ])
  })

  it('reports text that is not a playlist link as invalid', () => {
    const parsed = parseScanInput(`hello https://open.spotify.com/track/${A}`)
    expect(parsed.ids).toEqual([])
    expect(parsed.skipped.map(s => [s.input, s.why, s.playlistId])).toEqual([
      ['hello', 'invalid', null],
      [`https://open.spotify.com/track/${A}`, 'invalid', null],
    ])
  })

  it('caps at MAX_SCAN_LINKS and counts what it left out', () => {
    const text = Array.from({ length: MAX_SCAN_LINKS + 3 }, (_, i) => id(i)).join('\n')
    const parsed = parseScanInput(text)
    expect(parsed.ids).toHaveLength(MAX_SCAN_LINKS)
    expect(parsed.ids[0]).toBe(id(0))
    expect(parsed.overCap).toBe(3)
  })

  it('returns nothing for empty input', () => {
    expect(parseScanInput('  \n , ')).toEqual({ ids: [], skipped: [], overCap: 0 })
  })
})

describe('reasonFor', () => {
  it('picks a danger factor over a warning', () => {
    expect(
      reasonFor([
        { label: 'No description', level: 'warning', description: '' },
        { label: 'Recent follower spike', level: 'danger', description: '' },
      ]),
    ).toBe('Recent follower spike')
  })

  it('uses the clean wording when nothing warns', () => {
    expect(reasonFor([{ label: 'No red flags detected', level: '', description: '' }])).toBe(CLEAN_REASON)
  })
})

describe('orderRows', () => {
  it('puts scored rows first by score, then skipped rows in input order', () => {
    const rows: FullRow[] = [
      { kind: 'skipped', input: 'x', playlistId: null, why: 'invalid' },
      scored({ playlistId: A, score: 10 }),
      { kind: 'skipped', input: B, playlistId: B, why: 'not_found' },
      scored({ playlistId: C, score: 80 }),
    ]
    expect(orderRows(rows).map(r => (r.kind === 'scored' ? r.score : r.input))).toEqual([80, 10, 'x', B])
  })

  it('counts medium and high rows as flagged', () => {
    const report = buildReport([
      scored({ level: 'high', score: 60 }),
      scored({ level: 'medium', score: 30 }),
      scored({ level: 'low', score: 5 }),
    ])
    expect(report.flagged).toBe(2)
  })
})

describe('distributorReply', () => {
  const report = buildReport([
    scored(),
    scored({ playlistId: B, name: 'Clean List', owner: 'Real Person', level: 'low', score: 0, reason: CLEAN_REASON }),
  ])

  it('lists only the flagged playlists', () => {
    const text = distributorReply(report, FILLED)
    expect(text).toBe(
      [
        'Hi DistroKid team,',
        '',
        "Thanks for letting me know about the artificial streaming flag on Low Tide. I haven't bought streams or used any service that guarantees streams.",
        '',
        "I've checked the playlists my music is on with SpotCheck, which scores public playlist data for signs of bot activity. These show warning signs:",
        '',
        `- Chill Vibes by Curator Co, risk 70/100 (Suspiciously high ratio): https://open.spotify.com/playlist/${A}`,
        '',
        "I'm contacting these curators to ask for my music to be removed. If you can tell me which playlist or source Spotify flagged, I'll deal with it directly.",
        '',
        'Thanks,',
        'Sam Rivers',
      ].join('\n'),
    )
    expect(text).not.toContain('Clean List')
  })

  it('asks the distributor directly when nothing is flagged', () => {
    const text = distributorReply(buildReport([scored({ level: 'low', score: 0 })]), FILLED)
    expect(text).toContain(
      "I've checked the 1 playlist my music is on with SpotCheck, which scores public playlist data for signs of bot activity. None show warning signs, so I'd be grateful if you could tell me which playlist or source Spotify flagged.",
    )
    expect(text).not.toContain('These show warning signs')
    expect(text).not.toContain('contacting these curators')
  })

  it('uses placeholders for blank fields', () => {
    const text = distributorReply(report, { artistName: ' ', trackName: '', distributor: '' })
    expect(text).toMatch(/^Hi there,/)
    expect(text).toContain('flag on [Track name].')
    expect(text).toMatch(/Thanks,\n\[Your name\]$/)
  })

  it('never contains a long dash', () => {
    expect(distributorReply(report, BLANK)).not.toMatch(/[\u2014\u2013]/)
    expect(distributorReply(buildReport([]), FILLED)).not.toMatch(/[\u2014\u2013]/)
  })
})

describe('removalRequest', () => {
  it('fills the curator, playlist and track', () => {
    expect(removalRequest(scored(), FILLED)).toBe(
      [
        'Hi Curator Co,',
        '',
        "My track Low Tide is on your playlist Chill Vibes. Please could you remove it? My distributor has flagged unusual streaming activity, and I'm taking my music off playlists I can't verify.",
        '',
        'Thanks,',
        'Sam Rivers',
      ].join('\n'),
    )
  })

  it('uses placeholders for blank fields and has no long dash', () => {
    const text = removalRequest(scored(), BLANK)
    expect(text).toContain('My track [Track name] is on')
    expect(text).toMatch(/\[Your name\]$/)
    expect(text).not.toMatch(/[\u2014\u2013]/)
  })
})

describe('buildReport', () => {
  const skipped = { kind: 'skipped', input: 'nope', playlistId: null, why: 'invalid' } as const
  const report = buildReport([
    scored({ playlistId: A, name: 'Zebra Beats', owner: 'Farm One', score: 40, level: 'medium' }),
    scored({ playlistId: B, name: 'Chill Vibes', owner: 'Farm Two', score: 90, level: 'high' }),
    scored({ playlistId: C, name: 'Acoustic Leeds', owner: 'Sam', score: 3, level: 'low', reason: CLEAN_REASON }),
    skipped,
  ])

  it('ranks scored rows by score and puts skipped rows last', () => {
    expect(report.rows.map(r => (r.kind === 'scored' ? r.score : 'skipped'))).toEqual([90, 40, 3, 'skipped'])
  })

  it('counts the flagged and scored playlists, leaving skipped rows out of both', () => {
    expect(report).toMatchObject({ flagged: 2, scanned: 3 })
    expect(report).not.toHaveProperty('locked')
  })
})
