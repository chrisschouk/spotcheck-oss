# SpotCheck browser extension

Checks a Spotify playlist for bot-farm patterns from the playlist page or a pasted link. It uses the free checker at spotcheck.cc, so there is nothing to sign in to and nothing to pay for.

See the "Browser extension" section of the main README for what it does and how to load it.

## Develop

```bash
cd extension
npm install
npm test
npm run lint
npm run build   # writes dist/spotcheck-extension-<version>.zip
```

The three manifests are kept in step by hand and checked by `__tests__/manifest.test.js`: `manifest.json` (Chrome, MV3), `manifest.firefox.json` and `manifest.safari.json` (MV2).
