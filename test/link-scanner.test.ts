import { describe, expect, it } from 'vitest'

import { isLikelyLinkScanner } from '../src/link-scanner.js'

/**
 * The list exists to keep non-human link opens out of visit counts, so the tests
 * that matter are the two directions: every scanner shape must be caught, and
 * every real browser must pass. A false positive drops a genuine visit; a false
 * negative counts a robot as one.
 */
describe('isLikelyLinkScanner', () => {
  const REAL_BROWSERS = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36',
    // A phone brand with "bot" in its name must not trip the crawler catch-all.
    'Mozilla/5.0 (Linux; Android 12; CUBOT KINGKONG 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0',
  ]

  const SCANNERS = [
    'Mozilla/5.0 (compatible; Proofpoint Link Isolation)',
    'Mozilla/5.0 (compatible; Barracuda Sentinel)',
    'Mimecast LinkScanner',
    'Mozilla/5.0 (Windows NT 6.1; WOW64) FacebookExternalHit/1.1',
    'GoogleImageProxy',
    'YahooMailProxy; https://help.yahoo.com/kb/yahoo-mail-proxy-SLN28749.html',
    'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
    'Twitterbot/1.0',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)',
    'Pingdom.com_bot_version_1.4',
    'curl/8.4.0',
    'python-requests/2.32.3',
    'node-fetch/1.0 (+https://github.com/bitinn/node-fetch)',
    'HeadlessChrome/127.0.0.0',
    // AI crawlers in browser-shaped UAs, which the list missed before.
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)',
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ChatGPT-User/1.0; +https://openai.com/bot',
    'meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)',
    'Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)',
    'CCBot/2.0 (https://commoncrawl.org/faq/)',
    'Mozilla/5.0 (compatible; Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot)',
    // Unnamed crawlers caught by the catch-alls.
    'Mozilla/5.0 (compatible; SomeNewCrawler/1.0; +https://example.com/crawler)',
    'Mozilla/5.0 (compatible; ExampleBot/2.1)',
  ]

  it.each(REAL_BROWSERS)('lets a real browser through: %s', ua => {
    expect(isLikelyLinkScanner(ua)).toBe(false)
  })

  it.each(SCANNERS)('catches a scanner or bot: %s', ua => {
    expect(isLikelyLinkScanner(ua)).toBe(true)
  })

  it('treats a missing user-agent as a scanner, because every browser sends one', () => {
    expect(isLikelyLinkScanner(null)).toBe(true)
    expect(isLikelyLinkScanner(undefined)).toBe(true)
    expect(isLikelyLinkScanner('')).toBe(true)
    expect(isLikelyLinkScanner('   ')).toBe(true)
  })
})
