import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { askJev, INORGANIC_QUESTION, jevRequestBody, jevState } from '../src/jev.js'
import { CORPUS } from './bot-scorer-corpus.js'

const INPUT = {
  name: 'Gym Hits',
  description: 'Hard-hitting workout tracks',
  followers: 25000,
  tracks: 80,
  snapshots: [
    { followers: 25000, snapshot_at: '2026-09-22T00:00:00.000Z' },
    { followers: 12000, snapshot_at: '2026-09-21T00:00:00.000Z' },
  ],
}
const NOW = Date.parse('2026-09-22T12:00:00.000Z')

const answer = (noul: unknown, extra: object = {}) =>
  new Response(JSON.stringify({ answers: { inorganic: { type: 'noul', noul } }, ...extra }), {
    status: 200,
  })

describe('jevState', () => {
  it('sends only public playlist data, history newest first as days ago', () => {
    expect(JSON.parse(jevState(INPUT, NOW))).toEqual({
      playlist_name: 'Gym Hits',
      description: 'Hard-hitting workout tracks',
      followers: 25000,
      tracks: 80,
      follower_history_newest_first: [
        { days_ago: 0.5, followers: 25000 },
        { days_ago: 1.5, followers: 12000 },
      ],
    })
  })

  it('fills missing name, description and history with empty values', () => {
    expect(JSON.parse(jevState({ followers: 3, tracks: 9 }, NOW))).toEqual({
      playlist_name: '',
      description: '',
      followers: 3,
      tracks: 9,
      follower_history_newest_first: [],
    })
  })

  it('adds median track popularity and the near-zero share once enough tracks were sampled', () => {
    const trackPopularity = [...Array(15).fill(0), ...Array(10).fill(60)]
    expect(JSON.parse(jevState({ followers: 50000, tracks: 25, trackPopularity }, NOW))).toMatchObject({
      median_track_popularity_0_to_100: 0,
      share_of_tracks_with_popularity_5_or_less: 0.6,
    })
    const state = JSON.parse(jevState({ followers: 50000, tracks: 5, trackPopularity: [0, 0, 0] }, NOW))
    expect(state).not.toHaveProperty('median_track_popularity_0_to_100')
  })

  it('never leaks a corpus label or rationale into the state', () => {
    for (const row of CORPUS) {
      const state = jevState(row.input, NOW)
      expect(state).not.toContain(row.why)
      expect(Object.keys(JSON.parse(state))).not.toContain('label')
    }
  })

  it('asks the inorganic question as a noul, pinned to a fixed model', () => {
    const body = JSON.parse(jevRequestBody(INPUT, NOW))
    expect(body.model).toBe('jev-1.13.0')
    expect(body.questions).toEqual({ inorganic: { type: 'noul', instructions: INORGANIC_QUESTION } })
    expect(typeof body.state).toBe('string')
  })
})

describe('askJev', () => {
  it('returns the probability and input tokens on success', async () => {
    const fetchImpl = vi.fn(async () => answer(0.72, { usage: { input_tokens: 140 } }))
    expect(await askJev(INPUT, { apiKey: 'test-key', fetch: fetchImpl })).toEqual({
      status: 'ok',
      probability: 0.72,
      inputTokens: 140,
    })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.typesafe.ai/v1/systemone')
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer test-key',
      'content-type': 'application/json',
    })
  })

  it('is unavailable for auth without calling the API when no key is given', async () => {
    const fetchImpl = vi.fn()
    expect(await askJev(INPUT, { fetch: fetchImpl })).toEqual({ status: 'unavailable', reason: 'auth' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('retries a 429 and returns the later answer', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('high demand', { status: 429 }))
      .mockResolvedValueOnce(answer(0.4))
    expect(await askJev(INPUT, { apiKey: 'test-key', fetch: fetchImpl })).toEqual({ status: 'ok', probability: 0.4 })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('retries a 529 (overloaded) and returns the later answer', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('overloaded', { status: 529 }))
      .mockResolvedValueOnce(answer(0.4))
    expect(await askJev(INPUT, { apiKey: 'test-key', fetch: fetchImpl })).toEqual({ status: 'ok', probability: 0.4 })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('gives up as rate_limited once backoff would pass the budget', async () => {
    const fetchImpl = vi.fn(async () => new Response('high demand', { status: 429 }))
    expect(await askJev(INPUT, { apiKey: 'test-key', fetch: fetchImpl, timeoutMs: 100 })).toEqual({
      status: 'unavailable',
      reason: 'rate_limited',
    })
  })

  it('gives up as error once 529 backoff would pass the budget', async () => {
    const fetchImpl = vi.fn(async () => new Response('overloaded', { status: 529 }))
    expect(await askJev(INPUT, { apiKey: 'test-key', fetch: fetchImpl, timeoutMs: 100 })).toEqual({
      status: 'unavailable',
      reason: 'error',
    })
  })

  it('aborts a slow call as a timeout', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    )
    expect(await askJev(INPUT, { apiKey: 'test-key', fetch: fetchImpl as typeof fetch, timeoutMs: 20 })).toEqual({
      status: 'unavailable',
      reason: 'timeout',
    })
  })

  it.each([
    [401, 'auth'],
    [422, 'error'],
    [500, 'error'],
  ])('maps HTTP %i to %s', async (status, reason) => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status }))
    expect(await askJev(INPUT, { apiKey: 'test-key', fetch: fetchImpl })).toEqual({ status: 'unavailable', reason })
  })

  it.each([
    ['a non-JSON body', new Response('not json', { status: 200 })],
    ['a missing answer', new Response(JSON.stringify({ answers: {} }), { status: 200 })],
    ['a probability out of range', answer(1.5)],
    ['a string probability', answer('0.5')],
  ])('treats %s as an error', async (_case, res) => {
    expect(await askJev(INPUT, { apiKey: 'test-key', fetch: vi.fn(async () => res) })).toEqual({
      status: 'unavailable',
      reason: 'error',
    })
  })

  it('treats a network failure as an error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    expect(await askJev(INPUT, { apiKey: 'test-key', fetch: fetchImpl })).toEqual({ status: 'unavailable', reason: 'error' })
  })
})
