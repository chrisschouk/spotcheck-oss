import { describe, it, expect } from 'vitest';
import { SpotifyAPI, extractTrackId } from '../lib/spotify-api.js';

describe('SpotifyAPI.extractPlaylistId', () => {
  it('parses an open.spotify.com URL', () => {
    expect(
      SpotifyAPI.extractPlaylistId('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')
    ).toBe('37i9dQZF1DXcBWIGoYBM5M');
  });

  it('parses a spotify: URI', () => {
    expect(SpotifyAPI.extractPlaylistId('spotify:playlist:37i9dQZF1DXcBWIGoYBM5M')).toBe(
      '37i9dQZF1DXcBWIGoYBM5M'
    );
  });

  it('returns null for unparseable input', () => {
    expect(SpotifyAPI.extractPlaylistId('not a playlist')).toBe(null);
    expect(SpotifyAPI.extractPlaylistId('')).toBe(null);
  });
});

describe('extractTrackId', () => {
  it('parses open.spotify.com track URLs', () => {
    expect(extractTrackId('https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh?si=abc')).toBe(
      '4iV5W9uYEdYUVa79Axb7Rh',
    );
  });

  it('parses spotify:track URIs and bare ids', () => {
    expect(extractTrackId('spotify:track:4iV5W9uYEdYUVa79Axb7Rh')).toBe('4iV5W9uYEdYUVa79Axb7Rh');
    expect(extractTrackId('4iV5W9uYEdYUVa79Axb7Rh')).toBe('4iV5W9uYEdYUVa79Axb7Rh');
  });

  it('returns null for playlist links and junk', () => {
    expect(extractTrackId('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')).toBeNull();
    expect(extractTrackId('not-a-track')).toBeNull();
  });
});
