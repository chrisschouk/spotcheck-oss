/**
 * SpotCheck popup: paste a playlist link, read the free report, export a CSV.
 * Cross-browser (Chrome, Firefox, Safari).
 */

import { SpotifyAPI } from '../lib/spotify-api.js';
import { interpretCheck, requestCheck } from '../lib/check-result.js';
import { clearChildren, createFactorBadge, formatNumber, setText } from '../lib/dom-utils.js';
import { buildCsv } from '../lib/csv.js';

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

const elements = {
  playlistUrl: document.getElementById('playlistUrl'),
  checkBtn: document.getElementById('checkBtn'),
  results: document.getElementById('results'),
  errorState: document.getElementById('errorState'),
  errorTitle: document.getElementById('errorTitle'),
  errorMessage: document.getElementById('errorMessage'),
  limitState: document.getElementById('limitState'),
  limitMessage: document.getElementById('limitMessage'),
  limitLink: document.getElementById('limitLink'),
  playlistImage: document.getElementById('playlistImage'),
  playlistName: document.getElementById('playlistName'),
  curatorName: document.getElementById('curatorName'),
  curatorLink: document.getElementById('curatorLink'),
  statusBadge: document.getElementById('statusBadge'),
  followers: document.getElementById('followers'),
  tracks: document.getElementById('tracks'),
  visibility: document.getElementById('visibility'),
  botScore: document.getElementById('botScore'),
  botScoreFill: document.getElementById('botScoreFill'),
  gaugeCircle: document.getElementById('gaugeCircle'),
  botScoreFactors: document.getElementById('botScoreFactors'),
  openPlaylistBtn: document.getElementById('openPlaylistBtn'),
  exportBtn: document.getElementById('exportBtn'),
};

let currentResult = null;
let checkInFlight = false;

function init() {
  elements.checkBtn.addEventListener('click', handleCheck);
  elements.playlistUrl.addEventListener('keydown', event => {
    if (event.key === 'Enter') handleCheck();
  });
  elements.openPlaylistBtn.addEventListener('click', () => {
    const url = currentResult?.playlist?.external_urls?.spotify;
    if (url) browserAPI.tabs.create({ url });
  });
  elements.exportBtn.addEventListener('click', () => exportCsv(currentResult));
  prefillFromActiveTab();
}

async function handleCheck() {
  if (checkInFlight) return;

  const playlistId = playlistIdFromInput();
  if (!playlistId) return;

  checkInFlight = true;
  setLoading(true);
  hideAll();
  try {
    showResult(interpretCheck(await requestCheck(browserAPI.runtime, playlistId)));
  } finally {
    checkInFlight = false;
    setLoading(false);
  }
}

function playlistIdFromInput() {
  const url = elements.playlistUrl.value.trim();
  if (!url) {
    showError('Please enter a Spotify playlist URL');
    return null;
  }
  const playlistId = SpotifyAPI.extractPlaylistId(url);
  if (!playlistId) {
    showError(
      'Invalid Spotify playlist URL',
      'Enter a playlist link such as open.spotify.com/playlist/...',
    );
  }
  return playlistId;
}

function showResult(result) {
  switch (result.kind) {
    case 'verdict':
      currentResult = result;
      displayResults(result.playlist, result.botData);
      return;
    case 'limit':
      showLimit(result);
      return;
    default:
      showError(result.title, result.detail);
  }
}

function displayResults(playlist, botData) {
  elements.results.classList.remove('hidden');

  elements.playlistImage.src = playlist.images?.[0]?.url || '';
  setText(elements.playlistName, playlist.name || 'Untitled playlist');
  setText(elements.curatorName, playlist.owner?.display_name || 'Unknown curator');
  elements.curatorLink.href = playlist.owner?.external_urls?.spotify || '#';

  const isPrivate = playlist.public === false;
  elements.statusBadge.className = isPrivate ? 'status-badge private' : 'status-badge';
  setText(elements.statusBadge.querySelector('.status-text'), isPrivate ? 'Private' : 'Active');

  setText(elements.followers, formatNumber(playlist.followers?.total || 0));
  setText(elements.tracks, String(playlist.tracks?.total || 0));
  setText(elements.visibility, isPrivate ? 'Private' : 'Public');

  displayBotScore(botData);
}

function displayBotScore({ score, level, factors = [] }) {
  setText(elements.botScore, `${score}%`);
  elements.botScore.className = `bot-score-value ${level}`;

  elements.botScoreFill.style.width = `${score}%`;
  elements.botScoreFill.className = `bot-score-fill ${level}`;

  // Radial gauge: circumference for r=38, so a higher score sweeps more of the ring.
  const circumference = 2 * Math.PI * 38;
  const clamped = Math.max(0, Math.min(100, Number(score) || 0));
  elements.gaugeCircle.style.strokeDashoffset = String(circumference - (clamped / 100) * circumference);
  elements.gaugeCircle.setAttribute('class', `gauge-fill ${level}`);

  clearChildren(elements.botScoreFactors);
  for (const factor of factors) elements.botScoreFactors.appendChild(createFactorBadge(factor));
}

function exportCsv(result) {
  if (!result) return;
  const blob = new Blob([buildCsv(result.playlist, result.botData)], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `spotcheck-${result.playlist.id || 'playlist'}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function setLoading(loading) {
  elements.checkBtn.disabled = loading;
  elements.checkBtn.querySelector('.btn-text').classList.toggle('hidden', loading);
  elements.checkBtn.querySelector('.btn-loading').classList.toggle('hidden', !loading);
}

function hideAll() {
  elements.results.classList.add('hidden');
  elements.errorState.classList.add('hidden');
  elements.limitState.classList.add('hidden');
}

function showError(title, message = '') {
  hideAll();
  elements.errorState.classList.remove('hidden');
  setText(elements.errorTitle, title);
  setText(elements.errorMessage, message);
}

function showLimit({ message, next }) {
  hideAll();
  elements.limitState.classList.remove('hidden');
  setText(elements.limitMessage, message);
  setText(elements.limitLink, next.message);
  elements.limitLink.href = next.url;
}

async function prefillFromActiveTab() {
  try {
    const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
    if (tab?.url?.includes('open.spotify.com/playlist/') && SpotifyAPI.extractPlaylistId(tab.url)) {
      elements.playlistUrl.value = tab.url;
    }
  } catch {
    // No access to the active tab: leave the field empty.
  }
}

document.addEventListener('DOMContentLoaded', init);
