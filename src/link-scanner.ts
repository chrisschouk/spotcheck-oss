/**
 * Link scanners and monitoring bots, kept in one place.
 *
 * Mail security appliances, link previewers and crawlers open every URL they
 * see. A tool that counts visits or clicks needs to tell those apart from a
 * person. This list matches non-browser user agents only, so a human in
 * Safari, Chrome, Firefox or Edge is never filtered. A missing user agent is
 * treated as suspicious, because every real browser sends one.
 */
const LINK_SCANNER_PATTERNS: readonly RegExp[] = [
  // Email security appliances and link sandboxes. These are the ones that
  // actually pre-open marketing links.
  /proofpoint/i,
  /urldefense/i,
  /barracuda/i,
  /mimecast/i,
  /outsidesecurity|symantec|messagelabs/i,
  /forcepoint|websense/i,
  /trendmicro|trend micro/i,

  // Mail clients and providers prefetching links to build previews.
  /googleimageproxy/i,
  /yahoomailproxy/i,
  /feedfetcher/i,
  /outlook-ios|outlook-android|microsoft office|ms-office/i,

  // Search, social and chat unfurlers.
  /googlebot|bingbot|duckduckbot|baiduspider|yandexbot|petalbot|bytespider/i,
  /slurp/i,
  /facebookexternalhit|facebookcatalog/i,
  /twitterbot|linkedinbot|slackbot|discordbot|telegrambot|whatsapp/i,
  /applebot|skypeuripreview/i,

  // SEO and analytics crawlers.
  /ahrefsbot|semrushbot|mj12bot|dotbot|seokicks|screaming frog/i,

  // Uptime monitors, which hit every URL on a schedule.
  /pingdom|uptimerobot|statuscake|better uptime|betterstack|checkly|hetrix/i,

  // Headless browsers and plain HTTP clients.
  /headlesschrome|phantomjs|puppeteer|playwright|selenium/i,
  /python-requests|aiohttp|httpx|curl\/|wget\/|go-http-client|java\/|okhttp/i,
  /node-fetch|undici|axios|got \(/i,

  // Performance and screenshot tooling.
  /vercel-screenshot|chrome-lighthouse|lighthouse/i,

  // AI crawlers and assistant fetchers. Most wear a browser-shaped
  // "Mozilla/5.0 ... (compatible; X)" UA, so no pattern above catches them.
  /gptbot|chatgpt-user|oai-searchbot|claudebot|claude-user|claude-searchbot|anthropic-ai/i,
  /perplexitybot|perplexity-user|ccbot|amazonbot|meta-externalagent|meta-externalfetcher/i,
  /googleother|google-inspectiontool|diffbot|youbot|cohere-ai|ai2bot|timpibot|imagesiftbot/i,
  /duckassistbot|mistralai-user|omgili|bravebot|kagibot/i,

  // Catch-alls for crawlers not named above. A browser never puts a "+http"
  // contact URL, "crawler", "spider" or a "somethingbot/1.0" token in its UA.
  /\+https?:\/\/|crawler|spider|bot\//i,
]

/** True when the User-Agent is clearly not a human in a browser. */
export function isLikelyLinkScanner(userAgent: string | null | undefined): boolean {
  if (!userAgent || !userAgent.trim()) return true
  return LINK_SCANNER_PATTERNS.some(pattern => pattern.test(userAgent))
}
