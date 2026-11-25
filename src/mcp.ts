/**
 * Local stdio MCP server. It runs on your machine with your own Spotify
 * credentials; nothing is sent to anyone else. Stdout carries JSON-RPC only.
 * The server starts and lists its tools without credentials and fails at call
 * time with a clear message.
 */

import { createRequire } from 'node:module'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { checkPlaylist, scanWarningPlaylists, CheckError } from './check.js'
import { formatCheck, formatScan } from './format.js'
import { SpotifyConfigError } from './spotify.js'

const require = createRequire(import.meta.url)
const { version } = require('../package.json') as { version: string }

function credentials() {
  return {
    spotifyClientId: process.env.SPOTIFY_CLIENT_ID,
    spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    jevApiKey: process.env.TYPESAFE_API_KEY || undefined,
  }
}

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean }

async function run(work: () => Promise<string>): Promise<ToolResult> {
  try {
    return { content: [{ type: 'text', text: await work() }] }
  } catch (error) {
    const message =
      error instanceof CheckError || error instanceof SpotifyConfigError
        ? error.message
        : `Check failed: ${error instanceof Error ? error.message : String(error)}`
    return { content: [{ type: 'text', text: message }], isError: true }
  }
}

export function createServer(): McpServer {
  const server = new McpServer({ name: 'spotcheck', version })

  server.registerTool(
    'check_playlist',
    {
      title: 'Check a Spotify playlist',
      description:
        'Score one public Spotify playlist for bot-farm patterns using public data. Returns a risk level, a 0 to 100 score and the signals behind it. Spotify-owned editorial playlists cannot be read.',
      inputSchema: { url: z.string().describe('A Spotify playlist URL, URI or 22 character id') },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ url }) => run(async () => formatCheck(await checkPlaylist(url, credentials()))),
  )

  server.registerTool(
    'scan_warning_playlists',
    {
      title: 'Scan playlists after an artificial streaming warning',
      description:
        'Score up to 50 Spotify playlists at once, for example the playlists listed in Spotify for Artists after a distributor warns about artificial streams. Returns them ranked by score.',
      inputSchema: {
        links: z.string().describe('Spotify playlist links or ids, separated by spaces, commas or new lines'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ links }) => run(async () => formatScan(await scanWarningPlaylists(links, credentials()))),
  )

  return server
}

export async function runMcpServer(): Promise<void> {
  await createServer().connect(new StdioServerTransport())
}
