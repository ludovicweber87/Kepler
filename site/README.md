# Kepler — public site

A single static page presenting Kepler 1.0. **No build step, no dependencies**: three files
(`index.html`, `styles.css`, `main.js`) plus the logo. Open `index.html` in a browser and you
see exactly what production serves.

## Design

The palette is the app's **“Light — Cream”** theme (`light-warm` in `src/theme/theme.ts`),
lifted verbatim into CSS custom properties at the top of `styles.css` — terracotta `#B0552F`,
olive `#636D36`, cream surfaces `#F4EEE2` / `#FCF8F0`, ink `#33302A`. If a colour is missing,
add it to the app theme first, then mirror it here.

The nav mark is the same five-path K-and-quill geometry as
`src/components/layout/Logo.tsx`, with the gradient stops set to the cream theme's
`primary.light` → `primary.dark`. The wordmark is the brand font (Alfa Slab One); body copy is
Poppins, code is JetBrains Mono — all three from Google Fonts.

**No product shots.** No screenshots, and no UI mocked up in CSS either. The page carries its
weight with type, rhythm and copy. A hand-built mock drifts from the real app the moment the UI
moves, and a page that shows a fake interface is worse than one that shows none — so if
screenshots are ever added, they should be real captures of the app in its Light — Cream theme,
not a recreation.

## Deploy

Anything that serves static files works. The site must be served from its own root — the paths
in `index.html` are relative.

**Vercel** — new project on this repo, then set **Root Directory** to `site`, framework preset
**Other**, no build command, output directory `.`. Do not reuse the root `vercel.json`: that one
builds the Next.js app.

**Netlify** — publish directory `site`, no build command.

**GitHub Pages** — push `site/` as the Pages source (or copy it to a `gh-pages` branch root).

## Editing

- Run `npx prettier --write site/` after edits — the repo's Prettier config covers HTML, CSS and JS.
- Claims on the page are meant to match the README and the code. Check before adding a new one.
- `main.js` handles exactly three things: scroll reveal, the nav shadow, and copy-to-clipboard.
  Anything heavier probably belongs in a real app, not here.
