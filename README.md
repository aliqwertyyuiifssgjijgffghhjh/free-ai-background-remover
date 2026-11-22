# Free AI Background Remover

A free, browser-first background remover. AI inference runs on each visitor's device using the open-source `@imgly/background-removal` package. User images are not uploaded to an AI server.

## Features
- Browser-side background removal and transparent PNG export
- Drag-and-drop and file picker; PNG, JPG and WebP
- No account, API key, or per-image inference bill
- Responsive Vite frontend and optional Cloudflare Worker health endpoint

## Run locally
Requires Node.js 20+.
```bash
npm install
npm run dev
```
Open the local URL printed by Vite. The first run may take longer while model assets download.

## Build
```bash
npm run build
npm run preview
```

## Deploy to Cloudflare Pages
Connect this GitHub repository to Cloudflare Pages. Choose Vite, build command `npm run build`, output directory `dist`. No secrets are needed for local browser inference.

## Optional Worker
The `worker/` endpoint only reports health/config; it does not run AI inference or accept images.
```bash
npm install
npx wrangler deploy
```
Set `VITE_API_BASE_URL` to the deployed Worker URL if you want the optional API status check. The app works without it.

## Capacity and costs
This design avoids central GPU inference bills, but does not guarantee 10,000 successful removals/day. Processing speed depends on each visitor's device, browser, image size, memory, and network. Model downloads and static hosting still consume bandwidth and are subject to provider limits.

## Privacy
Images are processed in the browser. This project includes no image-upload endpoint, account system, analytics, or persistent image storage. Model files are fetched from the package's configured asset source.

## Licensing
Project code: MIT (see `LICENSE`). The background-removal dependency and model assets have separate licenses and terms. Review https://github.com/imgly/background-removal-js before commercial use.

## Structure
- `src/main.js` — UI and client-side inference
- `src/style.css` — responsive styling
- `worker/index.js` — optional health endpoint
- `wrangler.toml` — Worker configuration
