/** Plain-text reports for the command line tool and the MCP server. */

import type { CheckReport, ScanReport } from './check.js'
import type { SkipReason } from './warning-scan.js'
import type { StreamFarmSignals } from './stream-farm-signals.js'

const LEVEL_WORDS = { low: 'Low', medium: 'Medium', high: 'High' } as const

const SKIP_WORDS: Record<SkipReason, string> = {
  invalid: 'not a Spotify playlist link',
  duplicate: 'listed more than once',
  spotify_owned: "Spotify's own playlist, which outside tools cannot read",
  not_found: 'not found, it may be private or deleted',
  error: 'Spotify did not answer, try again',
}

function streamFarmLine(signals: StreamFarmSignals): string {
  const pct = (n: number) => `${Math.round(n * 100)}%`
  return (
    `Stream-farm signals (measured, not scored): ${pct(signals.fanlessPlayShare)} of ${signals.sampled} sampled tracks ` +
    `are played well beyond their artist's following, ${pct(signals.recentAddShare)} were added in the last 30 days, ` +
    `median track popularity ${signals.medianPopularity}, median artist followers ${signals.medianArtistFollowers}.`
  )
}

export function formatCheck(report: CheckReport): string {
  const { playlist } = report
  const lines = [
    `${playlist.name} by ${playlist.owner}`,
    `${playlist.url}`,
    `${playlist.followers.toLocaleString('en-GB')} followers, ${playlist.tracks.toLocaleString('en-GB')} tracks`,
    '',
    `Risk: ${LEVEL_WORDS[report.level]} (${report.score}/100)`,
    '',
    ...report.factors.map(f => `- ${f.label}: ${f.description}`),
  ]
  if (report.streamFarm) lines.push('', streamFarmLine(report.streamFarm))
  lines.push(
    '',
    'This shows bot-farm patterns in public data. It does not say why anything was flagged, and it cannot see inside Spotify.',
  )
  return lines.join('\n')
}

export function formatScan(scan: ScanReport): string {
  const { report } = scan
  const lines = [
    `Scanned ${report.scanned} ${report.scanned === 1 ? 'playlist' : 'playlists'}, ${report.flagged} showing bot-farm patterns.`,
    '',
  ]
  for (const row of report.rows) {
    if (row.kind === 'scored') {
      lines.push(
        `${row.score}/100 ${LEVEL_WORDS[row.level]}  ${row.name} by ${row.owner} (${row.followers.toLocaleString('en-GB')} followers)`,
        `    ${row.reason}`,
        `    ${row.url}`,
      )
    } else {
      lines.push(`Skipped ${row.input}: ${SKIP_WORDS[row.why]}`)
    }
  }
  if (scan.overCap > 0) lines.push('', `${scan.overCap} further links were left out. The limit is 50 playlists a scan.`)
  const signalled = report.rows.flatMap(row =>
    row.kind === 'scored' && scan.streamFarm[row.playlistId] ? [{ row, s: scan.streamFarm[row.playlistId] }] : [],
  )
  if (signalled.length > 0) {
    lines.push('', 'Stream-farm signals (measured, not scored):')
    for (const { row, s } of signalled) lines.push(`- ${row.name}: ${streamFarmLine(s).replace(/^Stream-farm signals \(measured, not scored\): /, '')}`)
  }
  lines.push('', 'This shows bot-farm patterns in public data. It does not say why a distributor flagged anything.')
  return lines.join('\n')
}
