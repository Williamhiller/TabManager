# Tab Manager

A Chrome-first MV3 extension starter for tab management with:

- `sidepanel`
- `popup`
- `options`
- a standalone `dashboard.html`

The stack is intentionally simple:

- `WXT` for extension build/dev and file-based entrypoints
- `React` for all UIs
- `Tailwind CSS` for styling
- `Motion` for interaction and layout animation

## Store Submission Kit

For app store publishing, use:

- `docs/STORE_LISTING.md` for short/long descriptions, permission rationale, and listing copy
- `PRIVACY.md` for the privacy policy template
- `privacy.html` as the public privacy-policy page for GitHub Pages

## First Version

The first working version already supports:

- searching tabs by title, URL, hostname, and group title
- filtering by active, sleeping, audible, pinned, grouped, ungrouped, and incognito state
- sorting by recent access, oldest access, title, and tracked active time
- row actions for focus, pin or unpin, mute or unmute, discard, and close
- multi-select batch actions for close, pin, mute, discard, group, and ungroup
- a side panel workspace, popup launcher, options page, and standalone dashboard
- system-memory snapshots plus runtime tab telemetry in the background service

## Why this architecture

`WXT` is the right fit here because browser extensions are naturally multi-entrypoint apps. It supports file-based entrypoints for `background`, `popup`, `sidepanel`, `options`, and unlisted pages in one build pipeline. That keeps the manifest and build config smaller than a hand-rolled MV3 + Vite setup.

This starter keeps the architecture deliberately flat:

- `background` is the browser-facing service layer
- extension pages are thin React surfaces
- shared contracts, formatting, and settings live in `src/lib`

There is no Redux/Zustand layer yet. For an extension of this size, `chrome.runtime.sendMessage` plus `chrome.storage.sync` is enough.

## Directory layout

```text
src/
  assets/
    base.css
  components/
    OptionsPage.tsx
    OverviewPage.tsx
  entrypoints/
    background.ts
    dashboard/
    options/
    popup/
    sidepanel/
  lib/
    background-service.ts
    contracts.ts
    format.ts
    runtime-client.ts
    settings.ts
```

## Entrypoint responsibilities

- `background.ts`
  - Tracks runtime tab telemetry
  - Serves tab + system-memory snapshots to UIs
  - Opens the standalone dashboard on request from extension surfaces

- `sidepanel/`
  - Primary persistent workspace
  - Best place for batch tab management, grouping, and analytics

- `popup/`
  - Quick launcher
  - Good for lightweight actions and surface switching

- `dashboard/`
  - Standalone full-page workspace opened in its own tab
  - Best place for denser tables, search, and future route-based flows

## Data flow

1. Browser APIs are read in the background service.
2. React surfaces request normalized snapshots through runtime messaging.
3. User preferences are persisted in `chrome.storage.sync`.

## Commands

```bash
npm install
npm run dev
npm run build
```

After `npm run build`, load `output/chrome-mv3` as an unpacked extension in Chrome.

## Recommended next steps

1. Move runtime tab telemetry into `chrome.storage.session` if you want it to survive service worker restarts.
2. Add feature folders under `src/features/` once tab rules, archival, or workspaces become substantial.

## References

- WXT entrypoints: https://wxt.dev/guide/essentials/entrypoints
- WXT frontend frameworks: https://wxt.dev/guide/essentials/frontend-frameworks
- Chrome Side Panel API: https://developer.chrome.com/docs/extensions/reference/api/sidePanel
- Tailwind with Vite: https://tailwindcss.com/docs/installation/using-vite
- Motion for React: https://motion.dev/docs/react-installation
