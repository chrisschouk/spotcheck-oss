import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkPlaylist, CheckError, scanWarningPlaylists } from '../src/check.js'
import { formatCheck, formatScan } from '../src/format.js'
import { SpotifyConfigError } from '../src/spotify.js'

const CREDS = { spotifyClientId: 'test-id', spotifyClientSecret: 'test-secret' }
const EXAMPLE = '1PmwMQY86pJuAm7veFt3u2'
const MISSING = '5oX3PmY6QeF6mmVDSCbQ4Z'
const SPOTIFY_OWNED = '37i9dQZF1DXcBWIGoYBM5M'
const UNREADABLE = '37i9dQZF1DX0XUsuxWHRQd'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** A playlist whose tracks all sit at popularity 1: a large following that does not listen. */
function playlistBody(id: string, overrides: Record<string, unknown> = {}) {
  const items = Array.from({ length: 30 }, (_, i) => ({
    added_at: '2026-01-01T00:00:00Z',
    is_local: false,
    track: { type: 'track', popularity: 1, artists: [{ id: `artist${i}` }] },
  }))
  return {
    id,
    name: 'Late Night Lofi',
    description: '',
    public: true,
    followers: { total: 60000 },
    tracks: { total: 300, items },
    images: [],
    owner: { id: 'curator1', display_name: 'Curator Co' },
    external_urls: { spotify: `https://open.spotify.com/playlist/${id}` },
    ...overrides,
  }
}

const calls: string[] = []

function installFetch(handlers: { playlist?: (id: string) => Response; page?: (id: string) => Response }) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    calls.push(url)
    if (url.startsWith('https://accounts.spotify.com/api/token')) return json({ access_token: 'tok', token_type: 'Bearer', expires_in: 3600 })
    const playlist = url.match(/api\.spotify\.com\/v1\/playlists\/([A-Za-z0-9]{22})/)
    if (playlist) return handlers.playlist ? handlers.playlist(playlist[1]) : json(playlistBody(playlist[1]))
    if (url.startsWith('https://api.spotify.com/v1/artists')) {
      const ids = new URL(url).searchParams.get('ids')!.split(',')
      return json({ artists: ids.map(id => ({ id, followers: { total: 40 } })) })
    }
    const page = url.match(/open\.spotify\.com\/playlist\/([A-Za-z0-9]{22})/)
    if (page) return handlers.page ? handlers.page(page[1]) : new Response('', { status: 404 })
    throw new Error(`unexpected fetch ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const creatorPage = (user: string) =>
  new Response(`<meta name="music:creator" content="https://open.spotify.com/user/${user}">`, { status: 200 })

beforeEach(() => {
  calls.length = 0
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('checkPlaylist', () => {
  it('scores a playlist from Spotify data with no Jev key and never calls Jev', async () => {
    installFetch({})
    const report = await checkPlaylist(`https://open.spotify.com/playlist/${EXAMPLE}?si=abc`, CREDS)
    expect(report.playlist).toMatchObject({ id: EXAMPLE, name: 'Late Night Lofi', owner: 'Curator Co', followers: 60000 })
    expect(report.level).toBe('high')
    expect(report.factors.map(f => f.label)).toContain("Followers don't seem to listen")
    expect(report.jev).toEqual({ status: 'unavailable', reason: 'auth' })
    expect(calls.some(url => url.includes('typesafe'))).toBe(false)
    expect(report.streamFarm).toMatchObject({ sampled: 30 })
  })

  it('sends the client credentials to Spotify and nothing else', async () => {
    const fetchMock = installFetch({})
    await checkPlaylist(EXAMPLE, CREDS)
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from('test-id:test-secret').toString('base64')}`,
    )
    expect(calls.every(url => /spotify\.com\//.test(url))).toBe(true)
  })

  it('rejects a link that is not a playlist before any request', async () => {
    const fetchMock = installFetch({})
    await expect(checkPlaylist('https://open.spotify.com/track/abc', CREDS)).rejects.toMatchObject({ code: 'invalid_url' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('names the missing credentials', async () => {
    installFetch({})
    await expect(checkPlaylist(EXAMPLE, {})).rejects.toBeInstanceOf(SpotifyConfigError)
    await expect(checkPlaylist(EXAMPLE, {})).rejects.toThrow(/SPOTIFY_CLIENT_ID/)
  })

  it('reports a private or deleted playlist as not found', async () => {
    installFetch({ playlist: () => json({ error: { status: 404 } }, 404) })
    await expect(checkPlaylist(MISSING, CREDS)).rejects.toMatchObject({ code: 'not_found' })
  })

  it('confirms a Spotify-owned playlist from the public page before saying so', async () => {
    installFetch({ playlist: () => json({ error: { status: 404 } }, 404), page: () => creatorPage('spotify') })
    const error = await checkPlaylist(SPOTIFY_OWNED, CREDS).catch(e => e)
    expect(error).toBeInstanceOf(CheckError)
    expect(error).toMatchObject({ code: 'spotify_owned' })
    expect(error.message).toMatch(/editorial and algorithmic playlists/)
  })

  it('says it cannot tell when an id in Spotify\'s namespace cannot be confirmed', async () => {
    installFetch({ playlist: () => json({}, 404), page: () => new Response('', { status: 500 }) })
    await expect(checkPlaylist(UNREADABLE, CREDS)).rejects.toMatchObject({ code: 'unverifiable' })
  })

  it('reports Spotify being unavailable on a server error', async () => {
    installFetch({ playlist: () => new Response('boom', { status: 503 }) })
    await expect(checkPlaylist(EXAMPLE, CREDS)).rejects.toMatchObject({ code: 'spotify_unavailable' })
  })

  it('formats a report that says what the score shows and does not claim a cause', async () => {
    installFetch({})
    const text = formatCheck(await checkPlaylist(EXAMPLE, CREDS))
    expect(text).toContain('Risk: High')
    expect(text).toContain('shows bot-farm patterns')
    expect(text).not.toMatch(/[\u2014\u2013]/)
  })
})

describe('scanWarningPlaylists', () => {
  it('ranks scored playlists and skips bad, duplicate, missing and Spotify-owned links', async () => {
    installFetch({
      playlist: id => {
        if (id === EXAMPLE) return json(playlistBody(id))
        if (id === MISSING) return json({}, 404)
        return json({}, 404)
      },
      page: id => (id === SPOTIFY_OWNED ? creatorPage('spotify') : new Response('', { status: 404 })),
    })
    const links = [
      `https://open.spotify.com/playlist/${EXAMPLE}`,
      'not-a-link',
      EXAMPLE,
      MISSING,
      SPOTIFY_OWNED,
    ].join('\n')
    const scan = await scanWarningPlaylists(links, CREDS)
    expect(scan.report).toMatchObject({ scanned: 1, flagged: 1 })
    expect(scan.report.rows[0]).toMatchObject({ kind: 'scored', playlistId: EXAMPLE, level: 'high' })
    const skipped = Object.fromEntries(
      scan.report.rows.flatMap(r => (r.kind === 'skipped' ? [[r.input, r.why]] : [])),
    )
    expect(skipped).toMatchObject({
      'not-a-link': 'invalid',
      [EXAMPLE]: 'duplicate',
      [`https://open.spotify.com/playlist/${MISSING}`]: 'not_found',
      [`https://open.spotify.com/playlist/${SPOTIFY_OWNED}`]: 'spotify_owned',
    })
    expect(scan.streamFarm[EXAMPLE]).toMatchObject({ sampled: 30 })
    expect(formatScan(scan)).toContain('Scanned 1 playlist, 1 showing bot-farm patterns.')
  })

  it('accepts a list as well as free text', async () => {
    installFetch({})
    const scan = await scanWarningPlaylists([EXAMPLE, MISSING], CREDS)
    expect(scan.report.scanned).toBe(2)
  })

  it('throws when no link is a playlist', async () => {
    installFetch({})
    await expect(scanWarningPlaylists('hello', CREDS)).rejects.toMatchObject({ code: 'invalid_url' })
  })

  it('throws when Spotify fails for every playlist', async () => {
    installFetch({ playlist: () => new Response('boom', { status: 502 }) })
    await expect(scanWarningPlaylists([EXAMPLE, MISSING], CREDS)).rejects.toMatchObject({ code: 'spotify_unavailable' })
  })

  it('reports how many links went past the 50 playlist cap', async () => {
    installFetch({})
    const ids = Array.from({ length: 52 }, (_, i) => `x${String(i).padStart(21, '0')}`)
    const scan = await scanWarningPlaylists(ids, CREDS)
    expect(scan.overCap).toBe(2)
    expect(scan.report.scanned).toBe(50)
  })
})
