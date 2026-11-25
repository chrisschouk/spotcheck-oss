import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// The three manifests are maintained by hand (MV3 Chrome, MV2 Firefox and Safari).
// They differ in structure, but the shared fields must stay in lockstep or one
// browser silently ships stale metadata or permissions.

const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = name => JSON.parse(readFileSync(join(dir, name), 'utf8'));

const chrome = load('manifest.json');
const firefox = load('manifest.firefox.json');
const safari = load('manifest.safari.json');
const pkg = load('package.json');
const all = { chrome, firefox, safari };

function hostPerms(m) {
  if (Array.isArray(m.host_permissions)) return [...m.host_permissions].sort();
  return (m.permissions || []).filter(p => p.includes('://')).sort();
}
function warResources(m) {
  const war = m.web_accessible_resources || [];
  if (war.length && typeof war[0] === 'object') return [...war[0].resources].sort();
  return [...war].sort();
}

describe('manifest consistency across browsers', () => {
  it('shares name, version, and description', () => {
    for (const [name, m] of Object.entries(all)) {
      expect(m.name, name).toBe(chrome.name);
      expect(m.version, name).toBe(chrome.version);
      expect(m.description, name).toBe(chrome.description);
    }
    expect(pkg.version).toBe(chrome.version);
    expect(chrome.version).toBe('1.1.0');
  });

  it('asks for the minimum: Spotify pages and spotcheck.cc, nothing else', () => {
    for (const [name, m] of Object.entries(all)) {
      expect(hostPerms(m), name).toEqual(['https://open.spotify.com/*', 'https://spotcheck.cc/*']);
      const apiPerms = (m.permissions || []).filter(p => !p.includes('://'));
      expect(apiPerms, name).toEqual([]);
      expect(m.externally_connectable, name).toBeUndefined();
      expect(m.key, name).toBeUndefined();
    }
  });

  it('injects the same single content script on playlist pages only', () => {
    const cs = m => m.content_scripts.map(c => ({ matches: c.matches, js: c.js }));
    expect(cs(chrome)).toEqual([
      { matches: ['https://open.spotify.com/playlist/*'], js: ['content/spotify-injector.js'] },
    ]);
    expect(cs(firefox)).toEqual(cs(chrome));
    expect(cs(safari)).toEqual(cs(chrome));
  });

  it('exposes the same web-accessible resources', () => {
    expect(warResources(firefox)).toEqual(warResources(chrome));
    expect(warResources(safari)).toEqual(warResources(chrome));
  });

  it('makes every module the content script imports web-accessible', () => {
    const injector = readFileSync(join(dir, 'content/spotify-injector.js'), 'utf8');
    const imported = [...injector.matchAll(/getURL\('([^']+\.js)'\)/g)].map(m => m[1]);
    expect(imported.length).toBeGreaterThan(0);
    for (const path of imported) expect(warResources(chrome)).toContain(path);
  });

  it('declares a content security policy in every variant', () => {
    expect(chrome.content_security_policy?.extension_pages).toBeTruthy();
    expect(typeof firefox.content_security_policy).toBe('string');
    expect(typeof safari.content_security_policy).toBe('string');
  });
});

describe('the extension has no account code', () => {
  it('ships no auth, premium or checkout wording in its source', () => {
    const files = ['background/service-worker.js', 'content/spotify-injector.js', 'popup/popup.js', 'popup/popup.html', 'lib/check-result.js'];
    for (const file of files) {
      const source = readFileSync(join(dir, file), 'utf8');
      expect(source, file).not.toMatch(/sessionToken|Authorization|checkout|Upgrade|Premium|sign in|api\.spotcheck\.cc/i);
    }
  });
});
