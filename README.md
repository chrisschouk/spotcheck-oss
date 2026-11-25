# SpotCheck

SpotCheck checks a Spotify playlist for bot-farm patterns before you pitch to it or pay for a placement. It reads public playlist data only, scores it, and shows which signals it found.

A result means a playlist shows bot-farm patterns. It does not say why a distributor or Spotify flagged anything, and it cannot see inside Spotify. Treat a high score as a reason to look closer, and a low score as the absence of the signals below, not as proof a playlist is real.

SpotCheck is made by [Total Audio Promo](https://totalaudiopromo.com), which uses it as Playlist check inside TAP. This repository holds the same scorer under the MIT licence, with a command line tool and a local MCP server that run on your own Spotify credentials.

## What it checks

- **Check:** one playlist, scored from 0 to 100 with the signals behind the score.
- **Warning scan:** up to 50 playlists at once, for example the playlists on your Spotify for Artists page after a distributor warns you about artificial streams. They come back ranked, with the flagged ones first.

Limits worth knowing:

- Spotify-owned editorial and algorithmic playlists (Today's Top Hits, New Music Friday, Discover Weekly) cannot be scored. Spotify does not release them to outside tools. SpotCheck says so rather than blaming your link.
- Private and deleted playlists cannot be read.
- It samples the first 100 tracks of a playlist.
- Without stored follower history, it scores the playlist as it is today. Spike and drop signals need a follower series, which you can pass in through the library.

## Install

Node 22 or later. You also need a Spotify developer app, which is free: create one at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) and copy its client ID and client secret. SpotCheck uses the client credentials flow, so it never asks you to sign in to Spotify.

```bash
export SPOTIFY_CLIENT_ID=your-client-id
export SPOTIFY_CLIENT_SECRET=your-client-secret
```

## Command line

```bash
npx github:chrisschouk/spotcheck-oss https://open.spotify.com/playlist/1PmwMQY86pJuAm7veFt3u2
```

A bare playlist id works too. Add `--json` for the full report as JSON.

To score several playlists from a warning:

```bash
npx github:chrisschouk/spotcheck-oss scan 1PmwMQY86pJuAm7veFt3u2 <another-link> <another-link>
```

Or pipe a list of links in with `scan -`.

## MCP server

The MCP server runs on your machine over stdio. It exposes two tools, `check_playlist` and `scan_warning_playlists`, and sends nothing anywhere except to Spotify (and to TypeSafe, only if you set the optional Jev key below).

Claude Code:

```bash
claude mcp add spotcheck \
  -e SPOTIFY_CLIENT_ID=your-client-id \
  -e SPOTIFY_CLIENT_SECRET=your-client-secret \
  -- npx -y github:chrisschouk/spotcheck-oss mcp
```

Claude Desktop (`claude_desktop_config.json`), or any client that takes the same format:

```json
{
  "mcpServers": {
    "spotcheck": {
      "command": "npx",
      "args": ["-y", "github:chrisschouk/spotcheck-oss", "mcp"],
      "env": {
        "SPOTIFY_CLIENT_ID": "your-client-id",
        "SPOTIFY_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

The server starts without credentials and lists its tools. A call without credentials returns a message telling you which variables to set.

## Library

```ts
import { checkPlaylist, scanWarningPlaylists } from '@totalaudiopromo/spotcheck'

const credentials = {
  spotifyClientId: process.env.SPOTIFY_CLIENT_ID,
  spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET,
}

const report = await checkPlaylist('1PmwMQY86pJuAm7veFt3u2', credentials)
console.log(report.level, report.score, report.factors)

const scan = await scanWarningPlaylists(['<link>', '<link>'], credentials)
console.log(scan.report.flagged, 'of', scan.report.scanned, 'flagged')
```

The package is not published to npm yet. Install it from GitHub:

```bash
npm install github:chrisschouk/spotcheck-oss
```

Bad links, missing playlists and Spotify-owned playlists throw a `CheckError` with a `code` (`invalid_url`, `not_found`, `spotify_owned`, `unverifiable`, `spotify_unavailable`). Missing credentials throw a `SpotifyConfigError`.

## How scoring works

Each signal that fires adds points. The total is capped at 100. 50 or more is high, 25 to 49 is medium, and below 25 is low.

| Signal | Fires when | Points |
| --- | --- | --- |
| Followers don't seem to listen | 10,000 or more followers and the median track popularity is 5 or below (at least 20 tracks sampled) | 25 |
| Suspiciously high ratio | More than 10,000 followers per track | 25 |
| Generic name pattern | A name such as "chill", "vibes" or "lofi" with more than 50,000 followers | 10 |
| No description | A description under 10 characters | 10 |
| Round follower count | An exact multiple of 1,000 above 1,000 | 15 |
| Recent follower spike | Up 20% or by 5,000 followers against about 24 hours ago (needs follower history) | 25 |
| Sustained follower drop | Down 10% or more against about 7 days ago (needs follower history) | 15 |

Track popularity is Spotify's own 0 to 100 measure of recent plays. A playlist with a real following lifts the plays of what it carries, so a large playlist whose typical track sits near zero has followers who do not listen. A median popularity of 20 or more is direct evidence of an engaged audience, so it overrides the ratio and generic name signals, which only guess from a playlist's shape.

**Stream-farm signals** are measured and reported next to a warning scan and a check: how many tracks are played far beyond what their artist's following explains, and how many were added in the last 30 days. They do not change the score yet. They are there to be calibrated against playlists from real warnings.

The thresholds are constants in `src/bot-scorer.ts`, and the tests in `test` pin them against a labelled corpus. The corpus is constructed, not observed, so it checks that the scorer does what it was designed to do. It says nothing about accuracy on real playlists.

### Jev, optional

Jev is TypeSafe's decision model. It is off by default and the heuristic works alone. To turn it on, set your own TypeSafe key:

```bash
export TYPESAFE_API_KEY=your-key
```

Jev can raise a score to a floor (25 for a likely-inorganic audience when the heuristic has seen at least one warning sign, 50 for a very likely one) and never lowers one. It does nothing for playlists under 1,000 followers. When you set a key, the playlist's name, description, follower and track counts and track popularity summary are sent to TypeSafe.

## Development

```bash
npm ci
npm test
npm run build
```

## Licence

MIT. Copyright Total Audio Promo Ltd.
