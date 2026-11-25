import { describe, expect, it } from 'vitest'
import { extractPlaylistId } from '../src/spotify.js'

describe('extractPlaylistId', () => {
  const ID = '37i9dQZF1DXcBWIGoYBM5M' // 22-char base62

  it('parses an open.spotify.com URL', () => {
    expect(extractPlaylistId(`https://open.spotify.com/playlist/${ID}`)).toBe(ID)
  })

  it('parses a localized URL with query params', () => {
    expect(
      extractPlaylistId(`https://open.spotify.com/intl-de/playlist/${ID}?si=abc123`),
    ).toBe(ID)
  })

  it('parses a spotify: URI', () => {
    expect(extractPlaylistId(`spotify:playlist:${ID}`)).toBe(ID)
  })

  it('accepts a bare id', () => {
    expect(extractPlaylistId(ID)).toBe(ID)
  })

  it('trims surrounding whitespace', () => {
    expect(extractPlaylistId(`  ${ID}  `)).toBe(ID)
  })

  it('rejects non-playlist links and junk', () => {
    expect(extractPlaylistId('https://open.spotify.com/track/abc')).toBeNull()
    expect(extractPlaylistId('not a url')).toBeNull()
    expect(extractPlaylistId('')).toBeNull()
    expect(extractPlaylistId('   ')).toBeNull()
  })
})
