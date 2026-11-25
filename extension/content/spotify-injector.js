/**
 * SpotCheck - Content Script
 * Injects validation UI directly into Spotify web player
 * Cross-browser compatible - Uses safe DOM methods (no innerHTML)
 */

// Cross-browser API
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// State
let isInjected = false;
let currentPlaylistId = null;

// The check client and number formatting load lazily from extension/lib, the
// same modules the popup uses. Both are declared in web_accessible_resources
// for open.spotify.com.
let checkLibPromise = null;
function loadCheckLib() {
  if (!checkLibPromise) {
    checkLibPromise = Promise.all([
      import(browserAPI.runtime.getURL('lib/check-result.js')),
      import(browserAPI.runtime.getURL('lib/ui-format.js')),
    ])
      .then(([check, format]) => ({ ...check, formatNumber: format.formatNumber }))
      .catch(err => {
        // Don't cache the rejection: a transient or CSP-blocked import should be
        // retryable on the next click rather than wedging the button forever.
        checkLibPromise = null;
        throw err;
      });
  }
  return checkLibPromise;
}

/**
 * Main injection function
 */
async function init() {
  if (isInjected) return;
  isInjected = true;

  const playlistId = extractPlaylistId(window.location.href);
  if (!playlistId) return;

  currentPlaylistId = playlistId;

  loadCheckLib();
  await waitForSpotify();
  injectFloatingButton();
  injectStyles();
  observeUrlChanges();
}

/**
 * Extract playlist ID from URL
 */
function extractPlaylistId(url) {
  const match = url.match(/playlist\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

/**
 * Wait for Spotify player to load
 */
async function waitForSpotify() {
  return new Promise(resolve => {
    const checkInterval = setInterval(() => {
      const mainContent =
        document.querySelector('[data-testid="playlist-page"]') ||
        document.querySelector('.playlist-page') ||
        document.querySelector('main');

      if (mainContent) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 500);

    setTimeout(() => {
      clearInterval(checkInterval);
      resolve();
    }, 10000);
  });
}

/**
 * Create SVG element helper
 */
function createSVG(width, height, viewBox, children) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('fill', 'none');

  children.forEach(child => svg.appendChild(child));
  return svg;
}

/**
 * Create SVG circle element
 */
function createSVGCircle(cx, cy, r, attrs = {}) {
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', String(cx));
  circle.setAttribute('cy', String(cy));
  circle.setAttribute('r', String(r));
  Object.entries(attrs).forEach(([key, value]) => circle.setAttribute(key, value));
  return circle;
}

/**
 * Create SVG path element
 */
function createSVGPath(d, attrs = {}) {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  Object.entries(attrs).forEach(([key, value]) => path.setAttribute(key, value));
  return path;
}

/**
 * Create check icon SVG
 */
function createCheckIcon(size = 20) {
  const circle = createSVGCircle(12, 12, 10, { stroke: 'currentColor', 'stroke-width': '2' });
  const path = createSVGPath('M8 12l3 3 5-6', {
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  });
  return createSVG(size, size, '0 0 24 24', [circle, path]);
}

/**
 * Create spinner icon SVG
 */
function createSpinnerIcon(size = 20) {
  const circle = createSVGCircle(12, 12, 10, {
    stroke: 'currentColor',
    'stroke-width': '2',
    fill: 'none',
    'stroke-dasharray': '60',
  });
  const svg = createSVG(size, size, '0 0 24 24', [circle]);
  svg.classList.add('spinner');
  return svg;
}

/**
 * Inject floating check button
 */
function injectFloatingButton() {
  const existing = document.getElementById('spot-checker-btn');
  if (existing) existing.remove();

  const button = document.createElement('button');
  button.id = 'spot-checker-btn';
  button.className = 'spot-checker-float-btn';
  button.title = 'Validate this playlist with SpotCheck';

  button.appendChild(createCheckIcon());

  const span = document.createElement('span');
  span.textContent = 'Check';
  button.appendChild(span);

  button.addEventListener('click', handleCheckClick);
  document.body.appendChild(button);
}

/**
 * Set button to loading state
 */
function setButtonLoading(button, isLoading) {
  button.classList.toggle('loading', isLoading);
  button.replaceChildren();

  button.appendChild(isLoading ? createSpinnerIcon() : createCheckIcon());
  const span = document.createElement('span');
  span.textContent = isLoading ? 'Checking...' : 'Check';
  button.appendChild(span);
}

/**
 * Inject validation badge next to playlist title
 */
function injectValidationBadge(data, formatNumber) {
  const existing = document.getElementById('spot-checker-badge');
  if (existing) existing.remove();

  const titleElement =
    document.querySelector('[data-testid="entityTitle"]') ||
    document.querySelector('h1') ||
    document.querySelector('.playlist-title');

  if (!titleElement) return;

  const badge = document.createElement('div');
  badge.id = 'spot-checker-badge';
  badge.className = `spot-checker-badge ${data.level}`;

  badge.appendChild(createCheckIcon(14));

  const scoreSpan = document.createElement('span');
  scoreSpan.textContent = data.botScore !== undefined ? `${data.botScore}% risk` : 'Verified';
  badge.appendChild(scoreSpan);

  badge.title = `Bot risk: ${data.level}\nFollowers: ${formatNumber(data.followers)}\nTracks: ${data.tracks}`;

  titleElement.parentElement?.appendChild(badge);
}

/**
 * Handle check button click
 */
async function handleCheckClick() {
  const button = document.getElementById('spot-checker-btn');
  if (!button) return;

  setButtonLoading(button, true);

  try {
    const lib = await loadCheckLib();
    const result = lib.interpretCheck(await lib.requestCheck(browserAPI.runtime, currentPlaylistId));
    if (result.kind !== 'verdict') {
      showError(lib.checkMessage(result));
      return;
    }

    const { playlist, botData } = result;
    showResultsPopover(playlist, botData, lib.formatNumber);
    injectValidationBadge(
      {
        level: botData.level,
        botScore: botData.score,
        followers: playlist.followers?.total,
        tracks: playlist.tracks?.total,
      },
      lib.formatNumber,
    );
  } catch (error) {
    console.error('Check failed:', error);
    showError("Couldn't check this playlist. Try again in a moment.");
  } finally {
    setButtonLoading(button, false);
  }
}

/**
 * Show results popover using safe DOM methods
 */
function showResultsPopover(playlist, botData, formatNumber) {
  const existing = document.getElementById('spot-checker-popover');
  if (existing) existing.remove();

  const popover = document.createElement('div');
  popover.id = 'spot-checker-popover';
  popover.className = 'spot-checker-popover';

  // Header
  const header = document.createElement('div');
  header.className = 'spot-checker-popover-header';

  const image = document.createElement('img');
  image.src = playlist.images?.[0]?.url || '';
  image.alt = '';
  image.className = 'spot-checker-popover-image';
  header.appendChild(image);

  const info = document.createElement('div');
  info.className = 'spot-checker-popover-info';

  const title = document.createElement('h3');
  title.className = 'spot-checker-popover-title';
  // Spotify fields are required in practice but not guaranteed: a malformed or
  // partial payload must degrade gracefully, never throw mid-render.
  title.textContent = playlist.name || 'Untitled playlist';
  info.appendChild(title);

  const curator = document.createElement('p');
  curator.className = 'spot-checker-popover-curator';
  curator.textContent = `by ${playlist.owner?.display_name || 'Unknown curator'}`;
  info.appendChild(curator);

  header.appendChild(info);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'spot-checker-popover-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '\u00D7';
  closeBtn.addEventListener('click', () => popover.remove());
  header.appendChild(closeBtn);

  popover.appendChild(header);

  // Metrics
  const metrics = document.createElement('div');
  metrics.className = 'spot-checker-popover-metrics';

  const metricsData = [
    { value: formatNumber(playlist.followers?.total || 0), label: 'Followers' },
    { value: String(playlist.tracks?.total || 0), label: 'Tracks' },
    { value: playlist.public ? 'Public' : 'Private', label: 'Visibility' },
  ];

  metricsData.forEach(m => {
    const metric = document.createElement('div');
    metric.className = 'spot-checker-metric';

    const value = document.createElement('span');
    value.className = 'spot-checker-metric-value';
    value.textContent = m.value;
    metric.appendChild(value);

    const label = document.createElement('span');
    label.className = 'spot-checker-metric-label';
    label.textContent = m.label;
    metric.appendChild(label);

    metrics.appendChild(metric);
  });

  popover.appendChild(metrics);

  // Score section
  const scoreSection = document.createElement('div');
  scoreSection.className = `spot-checker-popover-score ${botData.level}`;

  const scoreHeader = document.createElement('div');
  scoreHeader.className = 'spot-checker-score-header';

  const levelEmoji =
    { low: '\u2705', medium: '\u26A0\uFE0F', high: '\u274C' }[botData.level] || '\u2705';

  const scoreLabel = document.createElement('span');
  scoreLabel.textContent = `${levelEmoji} Bot Risk Score`;
  scoreHeader.appendChild(scoreLabel);

  const scoreValue = document.createElement('span');
  scoreValue.className = 'spot-checker-score-value';
  scoreValue.textContent = `${botData.score}%`;
  scoreHeader.appendChild(scoreValue);

  scoreSection.appendChild(scoreHeader);

  const scoreBar = document.createElement('div');
  scoreBar.className = 'spot-checker-score-bar';

  const scoreFill = document.createElement('div');
  scoreFill.className = 'spot-checker-score-fill';
  scoreFill.style.width = `${botData.score}%`;
  scoreBar.appendChild(scoreFill);

  scoreSection.appendChild(scoreBar);

  scoreSection.appendChild(createFactorList(botData));
  popover.appendChild(scoreSection);

  // Footer
  const footer = document.createElement('div');
  footer.className = 'spot-checker-popover-footer';

  const branding = document.createElement('a');
  branding.href = 'https://spotcheck.cc';
  branding.target = '_blank';
  branding.className = 'spot-checker-branding';
  branding.textContent = 'Powered by SpotCheck';
  footer.appendChild(branding);

  popover.appendChild(footer);

  // Close on click outside
  const closeHandler = e => {
    if (!popover.contains(e.target) && e.target.id !== 'spot-checker-btn') {
      popover.remove();
      document.removeEventListener('click', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('click', closeHandler), 100);

  document.body.appendChild(popover);
}

function createFactorList(botData) {
  const factors = document.createElement('div');
  factors.className = 'spot-checker-score-factors';

  (botData.factors || []).forEach(f => {
    const factor = document.createElement('span');
    factor.className = `spot-checker-factor ${f.level || ''}`;
    factor.textContent = f.label;
    if (f.description) factor.title = f.description;
    factors.appendChild(factor);
  });

  return factors;
}

/**
 * Show error message
 */
function showError(message) {
  const existing = document.getElementById('spot-checker-error');
  if (existing) existing.remove();

  const error = document.createElement('div');
  error.id = 'spot-checker-error';
  error.className = 'spot-checker-error';
  error.textContent = message || 'Something went wrong';

  document.body.appendChild(error);
  setTimeout(() => error.remove(), 6000);
}

/**
 * Observe URL changes (Spotify SPA navigation)
 */
function observeUrlChanges() {
  let lastUrl = window.location.href;

  // Spotify is a SPA. The previous approach observed the entire <body> subtree,
  // which fires on Spotify's constant DOM churn for what is ultimately a cheap
  // string compare. Polling location.href once a second is far lighter and
  // strictly more reliable (it also catches navigations with no DOM mutation).
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      handleUrlChange();
    }
  }, 1000);
}

/**
 * Handle URL change
 */
function handleUrlChange() {
  const playlistId = extractPlaylistId(window.location.href);

  if (playlistId && playlistId !== currentPlaylistId) {
    currentPlaylistId = playlistId;

    document.getElementById('spot-checker-badge')?.remove();
    document.getElementById('spot-checker-popover')?.remove();

    if (!document.getElementById('spot-checker-btn')) {
      injectFloatingButton();
    }
  } else if (!playlistId) {
    const btn = document.getElementById('spot-checker-btn');
    if (btn) btn.style.display = 'none';
  }
}

/**
 * Inject styles
 */
function injectStyles() {
  if (document.getElementById('spot-checker-styles')) return;

  const styles = document.createElement('style');
  styles.id = 'spot-checker-styles';
  styles.textContent = `
    .spot-checker-float-btn {
      position: fixed;
      bottom: 100px;
      right: 24px;
      z-index: 9999;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: #1DB954;
      border: none;
      border-radius: 24px;
      color: #000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
      transition: all 0.2s;
    }
    .spot-checker-float-btn:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 20px rgba(0,0,0,0.4);
    }
    .spot-checker-float-btn.loading {
      pointer-events: none;
      opacity: 0.8;
    }
    .spot-checker-float-btn .spinner {
      animation: spot-checker-spin 1s linear infinite;
    }
    @keyframes spot-checker-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .spot-checker-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      margin-left: 12px;
      border-radius: 16px;
      font-size: 12px;
      font-weight: 600;
      vertical-align: middle;
    }
    .spot-checker-badge.low {
      background: rgba(34, 197, 94, 0.2);
      color: #22c55e;
    }
    .spot-checker-badge.medium {
      background: rgba(245, 158, 11, 0.2);
      color: #f59e0b;
    }
    .spot-checker-badge.high {
      background: rgba(239, 68, 68, 0.2);
      color: #ef4444;
    }
    .spot-checker-popover {
      position: fixed;
      bottom: 160px;
      right: 24px;
      z-index: 10000;
      width: 320px;
      background: #282828;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      overflow: hidden;
      animation: spot-checker-slide-up 0.2s ease-out;
    }
    @keyframes spot-checker-slide-up {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .spot-checker-popover-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      background: #333;
    }
    .spot-checker-popover-image {
      width: 48px;
      height: 48px;
      border-radius: 4px;
      object-fit: cover;
    }
    .spot-checker-popover-info {
      flex: 1;
      min-width: 0;
    }
    .spot-checker-popover-title {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: #fff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .spot-checker-popover-curator {
      margin: 4px 0 0;
      font-size: 12px;
      color: #b3b3b3;
    }
    .spot-checker-popover-close {
      width: 28px;
      height: 28px;
      background: rgba(255,255,255,0.1);
      border: none;
      border-radius: 50%;
      color: #b3b3b3;
      font-size: 18px;
      cursor: pointer;
    }
    .spot-checker-popover-close:hover {
      background: rgba(255,255,255,0.2);
      color: #fff;
    }
    .spot-checker-popover-metrics {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      padding: 16px;
    }
    .spot-checker-metric {
      text-align: center;
    }
    .spot-checker-metric-value {
      display: block;
      font-size: 18px;
      font-weight: 700;
      color: #fff;
    }
    .spot-checker-metric-label {
      display: block;
      font-size: 11px;
      color: #727272;
      margin-top: 4px;
    }
    .spot-checker-popover-score {
      margin: 0 16px 16px;
      padding: 14px;
      background: #333;
      border-radius: 8px;
    }
    .spot-checker-score-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      font-size: 13px;
      color: #b3b3b3;
    }
    .spot-checker-score-value {
      font-weight: 700;
      padding: 4px 8px;
      border-radius: 4px;
    }
    .spot-checker-popover-score.low .spot-checker-score-value {
      background: rgba(34, 197, 94, 0.2);
      color: #22c55e;
    }
    .spot-checker-popover-score.medium .spot-checker-score-value {
      background: rgba(245, 158, 11, 0.2);
      color: #f59e0b;
    }
    .spot-checker-popover-score.high .spot-checker-score-value {
      background: rgba(239, 68, 68, 0.2);
      color: #ef4444;
    }
    .spot-checker-score-bar {
      height: 6px;
      background: #404040;
      border-radius: 3px;
      overflow: hidden;
    }
    .spot-checker-score-fill {
      height: 100%;
      border-radius: 3px;
      transition: width 0.5s;
    }
    .spot-checker-popover-score.low .spot-checker-score-fill {
      background: #22c55e;
    }
    .spot-checker-popover-score.medium .spot-checker-score-fill {
      background: #f59e0b;
    }
    .spot-checker-popover-score.high .spot-checker-score-fill {
      background: #ef4444;
    }
    .spot-checker-score-factors {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 10px;
    }
    .spot-checker-factor {
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 4px;
      background: #404040;
      color: #b3b3b3;
    }
    .spot-checker-factor.warning {
      background: rgba(245, 158, 11, 0.15);
      color: #f59e0b;
    }
    .spot-checker-factor.danger {
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
    }
    .spot-checker-popover-footer {
      padding: 12px 16px;
      border-top: 1px solid #404040;
      text-align: center;
    }
    .spot-checker-branding {
      font-size: 11px;
      color: #727272;
      text-decoration: none;
    }
    .spot-checker-branding:hover {
      color: #1DB954;
    }
    .spot-checker-error {
      position: fixed;
      bottom: 160px;
      right: 24px;
      z-index: 10000;
      padding: 12px 16px;
      background: #ef4444;
      color: #fff;
      border-radius: 8px;
      font-size: 13px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
      animation: spot-checker-slide-up 0.2s ease-out;
    }
  `;

  document.head.appendChild(styles);
}

// Run on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
