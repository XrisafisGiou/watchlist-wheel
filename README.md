# Watchlist Wheel

A simple movie picker for public Letterboxd watchlists.

**Live:** https://watchlist-wheel.vercel.app

## Features

- Enter a Letterboxd username or watchlist URL and save or delete profiles in your browser. Deleting a profile asks for confirmation.
- Open multiple saved profiles to find movies common to all of them.
- Browse 36 movies per page, search, sort, and select movies across pages. Runtimes appear beside release years; movie titles link to Letterboxd in a new tab.
- Optionally filter by maximum duration and genre. Genre buttons cycle through include, exclude, and neutral; exclusions take priority. Apply updates both the grid and wheel.
- Spin once or play elimination, with animation and sound effects. Spin again repeats the chosen mode.
- Load page posters before displaying the grid and load the winner's poster before revealing the result.
- Import a Letterboxd watchlist CSV.

Saved Letterboxd watchlists are refreshed every time you open a profile, including every member of a common-movies group. Watchlist requests bypass browser and CDN caching. Movie metadata and poster images stay cached locally for speed. CSV imports remain local snapshots and can be replaced by importing a newer export. No database or API key is required. Watchlists must be public; Letterboxd availability and rate limits affect imports. A failed refresh shows an error instead of opening an outdated list.

## Run locally

Use Node.js 22 or later.

```sh
npm ci
npm test
npm run build
npx vercel dev
```

The development command may prompt you to sign in and link a Vercel project. Open the local URL it prints. A static file server alone cannot serve the API functions.

## Deploy to Vercel

This repository is connected to the existing Watchlist Wheel Vercel project. Pushes to `main` automatically build and publish to https://watchlist-wheel.vercel.app; other branches receive preview deployments.

Import this repository in Vercel, or run `npx vercel --prod` after signing in. The included `vercel.json` configures the build and functions. No environment variables or paid integrations are needed.

The build generates `public/` and `server/assets.js`; these are intentionally ignored by Git. `.env*`, `.vercel/`, dependencies, and local test artifacts are also ignored.

## Project layout

- `client/`: HTML, CSS, and browser JavaScript.
- `api/`: Vercel function entry points for watchlists, posters, images, runtimes, and combined metadata.
- `server/`: shared request handlers and Letterboxd HTML parsing.
- `scripts/build.mjs`: generates deployable assets from the client source.
- `test/`: parser and API tests with a public HTML fixture.

Saved profiles are browser-specific and do not sync across devices or hostnames. This project is not affiliated with Letterboxd.
