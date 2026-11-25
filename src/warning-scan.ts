/**
 * Artificial streaming warning scan: the pure half.
 *
 * An artist whose distributor flagged a track pastes the playlists from their
 * Spotify for Artists page. This module turns that paste into playlist ids,
 * orders the scored results, and drafts the messages the artist needs to send.
 * scan.ts does the fetching and scoring.
 */

import { extractPlaylistId } from './spotify.js'
import type { ScoreFactor, ScoreLevel } from './bot-scorer.js'

export const MAX_SCAN_LINKS = 50

export type SkipReason = 'invalid' | 'duplicate' | 'spotify_owned' | 'not_found' | 'error'

export type ScoredRow = {
  kind: 'scored'
  playlistId: string
  url: string
  name: string
  owner: string
  followers: number
  tracks: number
  score: number
  level: ScoreLevel
  reason: string
}

export type SkippedRow = {
  kind: 'skipped'
  input: string
  playlistId: string | null
  why: SkipReason
}

export type FullRow = ScoredRow | SkippedRow

type Counts = { flagged: number; scanned: number; scannedAt: string }

/** Every verdict, ranked by score, with the playlists that could not be scored after them. */
export type FullReport = Counts & { rows: FullRow[] }

export type DraftFields = { artistName: string; trackName: string; distributor: string }

export type ParsedScanInput = {
  ids: string[]
  skipped: SkippedRow[]
  /** Valid, distinct links past MAX_SCAN_LINKS that were left out. */
  overCap: number
}

export const CLEAN_REASON = 'No warning signs in public data'

export function parseScanInput(text: string): ParsedScanInput {
  const ids: string[] = []
  const seen = new Set<string>()
  const skipped: SkippedRow[] = []
  let overCap = 0
  for (const input of text.split(/[\s,]+/).filter(Boolean)) {
    const playlistId = extractPlaylistId(input)
    if (!playlistId) {
      skipped.push({ kind: 'skipped', input, playlistId: null, why: 'invalid' })
    } else if (seen.has(playlistId)) {
      skipped.push({ kind: 'skipped', input, playlistId, why: 'duplicate' })
    } else if (ids.length >= MAX_SCAN_LINKS) {
      seen.add(playlistId)
      overCap++
    } else {
      seen.add(playlistId)
      ids.push(playlistId)
    }
  }
  return { ids, skipped, overCap }
}

const FACTOR_SEVERITY: Record<string, number> = { danger: 2, warning: 1 }

/** The label of the most severe factor, or the clean wording when none warns. */
export function reasonFor(factors: ScoreFactor[]): string {
  let worst = CLEAN_REASON
  let worstSeverity = 0
  for (const factor of factors) {
    const severity = FACTOR_SEVERITY[factor.level] ?? 0
    if (severity > worstSeverity) {
      worst = factor.label
      worstSeverity = severity
    }
  }
  return worst
}

export function isFlagged(row: FullRow): row is ScoredRow {
  return row.kind === 'scored' && row.level !== 'low'
}

export function orderRows(rows: FullRow[]): FullRow[] {
  const scored = rows.filter((r): r is ScoredRow => r.kind === 'scored')
  const skipped = rows.filter((r): r is SkippedRow => r.kind === 'skipped')
  return [...[...scored].sort((a, b) => b.score - a.score), ...skipped]
}

export function buildReport(rows: FullRow[], scannedAt: Date = new Date()): FullReport {
  const ordered = orderRows(rows)
  return {
    rows: ordered,
    flagged: ordered.filter(isFlagged).length,
    scanned: ordered.filter(row => row.kind === 'scored').length,
    scannedAt: scannedAt.toISOString(),
  }
}

function filled(fields: DraftFields) {
  return {
    artistName: fields.artistName.trim() || '[Your name]',
    trackName: fields.trackName.trim() || '[Track name]',
    distributor: fields.distributor.trim(),
  }
}

export function distributorReply(report: FullReport, fields: DraftFields): string {
  const f = filled(fields)
  const flagged = report.rows.filter(isFlagged)
  const findings =
    flagged.length > 0
      ? [
          'I\'ve checked the playlists my music is on with SpotCheck, which scores public playlist data for signs of bot activity. These show warning signs:',
          flagged
            .map(r => `- ${r.name} by ${r.owner}, risk ${r.score}/100 (${r.reason}): ${r.url}`)
            .join('\n'),
          'I\'m contacting these curators to ask for my music to be removed. If you can tell me which playlist or source Spotify flagged, I\'ll deal with it directly.',
        ]
      : [
          `I've checked the ${report.scanned} ${report.scanned === 1 ? 'playlist' : 'playlists'} my music is on with SpotCheck, which scores public playlist data for signs of bot activity. None show warning signs, so I'd be grateful if you could tell me which playlist or source Spotify flagged.`,
        ]
  return [
    f.distributor ? `Hi ${f.distributor} team,` : 'Hi there,',
    `Thanks for letting me know about the artificial streaming flag on ${f.trackName}. I haven't bought streams or used any service that guarantees streams.`,
    ...findings,
    `Thanks,\n${f.artistName}`,
  ].join('\n\n')
}

export function removalRequest(row: ScoredRow, fields: DraftFields): string {
  const f = filled(fields)
  return [
    `Hi ${row.owner},`,
    `My track ${f.trackName} is on your playlist ${row.name}. Please could you remove it? My distributor has flagged unusual streaming activity, and I'm taking my music off playlists I can't verify.`,
    `Thanks,\n${f.artistName}`,
  ].join('\n\n')
}
