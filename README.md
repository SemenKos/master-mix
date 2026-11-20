# Мастер микст — Beach & Court

A redesigned, installable PWA for running mixed beach-volleyball tournaments. The tournament scheduler, player entry and editing, win/loss recording, partner tracking, ranking, match history, statistics, Russian keyboard helper, local persistence, and offline shell are adapted from the supplied source.

## GitHub Pages setup

1. Create or open the `master-mix-redesign` repository.
2. Upload the contents of this folder to the repository root (keep `index.html`, `styles.css`, `app.js`, `manifest.json`, `sw.js`, and the icons together).
3. In repository **Settings → Pages**, publish from the desired branch and `/ (root)`.
4. Open the Pages URL over HTTPS. The PWA manifest and service worker use paths relative to the project site, so a URL such as `https://USER.github.io/master-mix-redesign/` is supported.

## Local preview

Serve this folder through a local web server, then open its URL in a browser. For example, from this folder run `python3 -m http.server 8000` and visit `http://localhost:8000/`. PWA installation and service-worker caching require localhost or HTTPS; opening `index.html` directly with `file://` does not enable them.

## Files

- `index.html` — app shell and metadata
- `styles.css` — responsive visual design
- `app.js` — tournament behavior and local storage
- `manifest.json`, `sw.js` — install metadata and offline cache
- `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`, `favicon-32.png` — app artwork in requested sizes

## Notes and limitations

- Tournament state remains in the browser's local storage; it does not sync between devices or browsers.
- No server, account, or network API is required. Google Fonts are optional and may not load offline; the system font stack remains available.
- The supplied application only implements the beach-volleyball mixed-pair format. Tennis is reflected in the broader visual identity; no separate tennis scoring mode was present in the source and none was invented.
- The files were packaged from the supplied archive, but live GitHub Pages publishing, browser-specific installation prompts, and offline behavior have not been exercised in this environment.
