# Collage Engine

A browser-based generative image collage tool. Upload photos, dial in chaos, export raw moodboard-style collages at multiple aspect ratios.

---

## What It Does

- Accepts JPG, PNG, WEBP, GIF, HEIC/HEIF image uploads
- Randomly crops, zooms, rotates, and places images on a canvas
- Non-overlapping placement with up to 40% overlap tolerance
- Randomized layer depth — chaos slider controls which images sit in foreground vs background
- Seeded dark background hue per composition
- Torn color blocks behind images, driven by chaos slider (position, size, color, edge jaggedness)
- Film grain overlay
- Export at three aspect ratios: Square (1080×1080), Horizontal (1920×1080), Vertical (1080×1920)
- Seed system — same seed always reproduces the same layout

---

## Stack

- **React 18** with hooks only (no external state library)
- **Vite** for dev server and build
- **HTML5 Canvas API** for all rendering
- **heic2any** for HEIC/HEIF conversion in-browser
- No CSS framework, no component library — all styles are inline JS objects

---

## Project Structure

```
collage-engine/
├── index.html
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx
    └── collage-engine.jsx   ← entire app lives here
```

---

## Local Development

```bash
git clone <your-repo-url>
cd collage-engine
npm install
npm run dev
```

Opens at `http://localhost:5173`.

---

## Production Build

```bash
npm run build
```

Outputs to `dist/`. Static files — deploy to Netlify, Vercel, Cloudflare Pages, or any static host by pointing it at the `dist/` folder.

---

## Hosting (Netlify example)

1. Push repo to GitHub
2. Connect repo in Netlify dashboard
3. Build command: `npm run build`
4. Publish directory: `dist`
5. Deploy

No environment variables required. No backend. Fully client-side.

---

## Key Implementation Notes

### Seeded PRNG
All randomness runs through a custom xorshift32 function `mkRand(seed)`. Same seed = same output deterministically. The chaos slider uses a second RNG stream (`seed ^ 0xdeadbeef` for layer ordering, `seed ^ 0xcafe1234` for color blocks) so each system is independently seeded from the same root value.

### Collision-Aware Placement
Each image tries 120 random positions. The algorithm tracks axis-aligned bounding boxes (accounting for rotation) and measures overlap fraction against all already-placed images. It accepts any position under 40% overlap, or falls back to the least-overlapping position found. All images are always placed — none are skipped.

### Layer Depth System
Each image gets two seeded z-scores from separate RNG streams. The chaos slider blends between them: `z = baseZ * (1 - chaos) + chaosZ * chaos`. Images are drawn sorted by this score (low = background, high = foreground). Background images render at 45% alpha and 82% scale; foreground at 100% alpha and 100% scale.

### Torn Color Blocks
Drawn before images using an 8-point irregular polygon. Each vertex is offset by a seeded jag value that scales with chaos (`±18px` at order, `±70px` at full chaos). Position, size, color, and rotation all interpolate between two seeded states as chaos moves, giving continuous live feedback on the slider.

### HEIC Support
`heic2any` is imported directly (npm) in the local build. It converts HEIC/HEIF blobs to JPEG client-side before passing to the canvas pipeline. Conversion is async via `Promise.allSettled` so multiple files process in parallel; failed files are silently skipped.

### Canvas Image Loading
All file reads use `FileReader.readAsDataURL` (base64) rather than `URL.createObjectURL` (blob URLs). This is required for canvas `drawImage` compatibility in sandboxed environments. In a local Vite build both approaches work, but base64 is kept for consistency.

### Export
Local build: `canvas.toBlob()` → `URL.createObjectURL` → programmatic `<a>` click → direct PNG download, filename includes aspect ratio and seed.
Claude artifact: `canvas.toBlob()` → `FileReader.readAsDataURL` → rendered as `<img>` in an overlay modal → user right-clicks or long-presses to save. (Blob URL downloads are blocked by the Claude sandbox.)

---

## Dependency Notes

| Package | Purpose |
|---|---|
| `react` / `react-dom` | UI and canvas draw loop via hooks |
| `vite` + `@vitejs/plugin-react` | Dev server, HMR, production build |
| `heic2any` | Client-side HEIC → JPEG conversion |

No other runtime dependencies.

---

## Planned Extensions

- **Video pipeline** — Remotion composition for stitching random-duration video clips into a collage video, using the same placement and chaos logic
- **Chaos-per-image controls** — individual opacity/scale overrides per uploaded image
- **Custom background color** — manual override of the seeded background hue
- **Animated export** — canvas recording via `MediaRecorder` while chaos slider animates automatically

---

## Canvas Dimensions by Aspect Ratio

| Label | Dimensions | Use Case |
|---|---|---|
| SQUARE | 1080 × 1080 | Instagram post, TikTok thumbnail |
| HORIZONTAL | 1920 × 1080 | YouTube, desktop wallpaper, 16:9 |
| VERTICAL | 1080 × 1920 | Instagram Stories, Reels, TikTok |
