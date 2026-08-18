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

The site is static — no build step. It must be served from its own root, since the paths in
`index.html` are relative. `vercel.json` in this folder carries the config (security headers,
a CSP scoped to what the page actually loads, `cleanUrls`), so nothing has to be set by hand
beyond the root directory.

### Vercel (dashboard)

1. **Add New… → Project**, import the `Kepler` repo.
2. Set **Root Directory** to `site`. This is the only setting that matters — with it, Vercel
   reads `site/vercel.json` and ignores the root one (which builds the Next.js app).
3. Framework preset resolves to **Other**; leave **Build Command** and **Install Command**
   empty and **Output Directory** as the default. There is no `package.json` here, so Vercel
   deploys the folder as static files.
4. Deploy. Every push to `main` redeploys; other branches get preview URLs.

### Vercel (CLI)

```bash
cd site
npx vercel        # preview deployment, links the project on first run
npx vercel --prod # promote to production
```

The first run asks for the scope and project name; answer **no** to "override the settings"
so `vercel.json` stays in charge.

### Caching

`styles.css` and `main.js` are referenced without content hashes, so they intentionally keep
Vercel's default `max-age=0, must-revalidate` — a redeploy is visible immediately. Only the
logos get a day of caching. If you ever add hashed assets, give them their own immutable rule.

### Other hosts

**Netlify** — publish directory `site`, no build command (headers need re-declaring in
`netlify.toml`; `vercel.json` is not read).
**GitHub Pages** — push `site/` as the Pages source. No custom headers, so the CSP above
won't apply.

## Editing

- Run `npx prettier --write site/` after edits — the repo's Prettier config covers HTML, CSS and JS.
- Claims on the page are meant to match the README and the code. Check before adding a new one.
- `main.js` handles exactly three things: scroll reveal, the nav shadow, and copy-to-clipboard.
  Anything heavier probably belongs in a real app, not here.
