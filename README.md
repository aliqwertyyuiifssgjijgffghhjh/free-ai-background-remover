# Free AI Background Remover

A hybrid background remover. It tries Cloudflare Images foreground segmentation on the server first, then falls back to the open-source `@imgly/background-removal` engine in the visitor's browser if server processing is unavailable.

## Features
- Cloudflare Images AI foreground segmentation through a Worker
- Automatic browser-side AI fallback
- Drag-and-drop and file picker; PNG, JPG and WebP
- Transparent PNG output
- 15 MB upload limit and browser image downscaling for large images
- No account or third-party inference API key in the frontend

## Deploy to Cloudflare
1. Connect this repository to Cloudflare Workers or deploy it with Wrangler.
2. Use build command `npm run build` and the static asset directory `dist`.
3. The Wrangler config declares the Cloudflare Images binding as `IMAGES`. Confirm the Images binding is enabled for this Worker in the Cloudflare dashboard if your deployment setup requires manual binding configuration.
4. Deploy with `npm install`, `npm run build`, and `npx wrangler deploy`.

The Worker exposes:
- `GET /api/health` — reports whether the Images binding is available.
- `POST /api/remove` — accepts a raw PNG/JPEG/WebP request body and returns a transparent PNG.

## Performance and fallback
The app tries Cloudflare Images segmentation first. If the server endpoint is not configured or fails, it loads the browser AI model as a fallback. The browser fallback may take longer on first use while model assets download. Processing speed depends on image dimensions, network, Cloudflare availability, and the visitor's device. No fixed processing-time guarantee is made.

## Costs and limits
Cloudflare Images documents up to 5,000 unique transformations per month on its Free plan. A transformation is counted per unique source-and-parameter combination; repeated matching transformations within the same calendar month do not count again. New unique transformations may be rejected after the free-plan limit is reached. Check current Cloudflare Images pricing and account usage before production launch.

## Privacy
The server path sends the selected image to Cloudflare for processing. If server processing fails, the browser fallback processes it locally. The Worker does not store uploaded source or result images. Responses use `Cache-Control: no-store`.

## Run locally
Requires Node.js 20+.
```bash
npm install
npm run dev
```

## Licensing
Project code: MIT (see `LICENSE`). The background-removal dependency and model assets have separate licenses and terms. Review https://github.com/imgly/background-removal-js before commercial use.
