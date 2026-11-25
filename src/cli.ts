#!/usr/bin/env node
import { createRequire } from 'node:module'
import { checkPlaylist, scanWarningPlaylists, CheckError } from './check.js'
import { formatCheck, formatScan } from './format.js'
import { SpotifyConfigError } from './spotify.js'

const require = createRequire(import.meta.url)
const { version } = require('../package.json') as { version: string }

const HELP = `spotcheck ${version}

Checks a Spotify playlist for bot-farm patterns, using public data only.

Usage
  spotcheck <playlist-url-or-id>          Check one playlist
  spotcheck scan <url-or-id>...           Score several playlists from a warning
                                          (or pipe links in on stdin with "scan -")
  spotcheck mcp                           Run the MCP server on stdio

Options
  --json       Print the report as JSON
  -h, --help   Show this help
  -v, --version

Environment
  SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET   Required. Create a Spotify developer app
                                             at https://developer.spotify.com/dashboard
  TYPESAFE_API_KEY                           Optional. Adds the Jev model to the score.
                                             Without it the heuristic runs alone.
`

function credentials() {
  return {
    spotifyClientId: process.env.SPOTIFY_CLIENT_ID,
    spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    jevApiKey: process.env.TYPESAFE_API_KEY || undefined,
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

async function main(argv: string[]): Promise<number> {
  const json = argv.includes('--json')
  const args = argv.filter(a => a !== '--json')
  if (args.includes('-h') || args.includes('--help') || args.length === 0) {
    process.stdout.write(HELP)
    return args.length === 0 ? 2 : 0
  }
  if (args.includes('-v') || args.includes('--version')) {
    process.stdout.write(`${version}\n`)
    return 0
  }

  const [first, ...rest] = args
  if (first === 'mcp') {
    const { runMcpServer } = await import('./mcp.js')
    await runMcpServer()
    return -1
  }

  if (first === 'scan') {
    if (rest.length === 0) {
      process.stderr.write('Give at least one playlist link, or "-" to read links from stdin.\n')
      return 2
    }
    const input = rest[0] === '-' ? await readStdin() : rest
    const scan = await scanWarningPlaylists(input, credentials())
    process.stdout.write(json ? `${JSON.stringify(scan, null, 2)}\n` : `${formatScan(scan)}\n`)
    return 0
  }

  const target = first === 'check' ? rest[0] : first
  if (!target) {
    process.stderr.write('Give a playlist link or id.\n')
    return 2
  }
  const report = await checkPlaylist(target, credentials())
  process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : `${formatCheck(report)}\n`)
  return 0
}

main(process.argv.slice(2)).then(
  code => {
    if (code >= 0) process.exitCode = code
  },
  error => {
    if (error instanceof CheckError || error instanceof SpotifyConfigError) {
      process.stderr.write(`${error.message}\n`)
    } else {
      process.stderr.write(`spotcheck failed: ${error instanceof Error ? error.message : String(error)}\n`)
    }
    process.exitCode = 1
  },
)
