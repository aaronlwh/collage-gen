# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # dev server at http://localhost:5173
npm run build     # production build → dist/
npm run preview   # preview production build locally
```

No test suite. No linter configured.

## Architecture

The entire app lives in one file: `collage-engine.jsx`. `src/main.jsx` only mounts it. There are no CSS files — all styles are inline JS objects defined in the `S` object and the `btn()` helper inside the component.

**Rendering** — all output is drawn to an HTML5 `<canvas>` via the `draw` callback (a `useCallback` memoized on `[imgs, chaos, seed, aspect]`). A `useEffect` reruns `draw` whenever those deps change. The canvas is sized to the full export resolution (e.g. 1920×1080) and scaled down to fill its container via `style={{ width: "100%", height: "auto" }}`.

**Seeded PRNG** — `mkRand(seed)` is an xorshift32 that produces deterministic sequences. Multiple independent RNG streams are created by XORing the seed with fixed constants (`seed ^ 0xdeadbeef`, `seed ^ 0xcafe1234`), keeping layer ordering and color block placement independent but reproducible from the same root seed.

**Placement algorithm** — each image tries up to 120 random positions, keeping axis-aligned bounding boxes (rotated extents). It accepts the first position under 40% overlap fraction; otherwise falls back to the least-overlapping candidate. All images are always placed.

**Depth system** — two seeded z-scores per image are blended by the chaos slider (`z = baseZ*(1-chaos) + chaosZ*chaos`). Drawing order is sorted ascending (low z = background). Background images render at 45% alpha / 82% scale; foreground at 100% / 100%.

**Export** — `canvas.toBlob()` → `FileReader.readAsDataURL` → rendered as `<img>` in a fixed overlay. User right-clicks/long-presses to save. (Blob URL downloads are avoided for sandbox compatibility.)

**HEIC support** — `heic2any` is lazy-loaded from a CDN `<script>` tag on first HEIC upload, then converts blobs to JPEG client-side before passing to the canvas pipeline.

## Key constants

- `ASPECTS` — defines the three canvas resolutions (square 1080×1080, horizontal 1920×1080, vertical 1080×1920)
- `MAX_TRIES = 120` — placement attempts per image
- `MAX_OVERLAP = 0.40` — overlap tolerance threshold
