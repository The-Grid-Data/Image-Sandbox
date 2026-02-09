# Image Sandbox

A browser-based tool for adapting logos and images across light and dark backgrounds. Change colors, remove backgrounds, touch up edges, upscale, and download — all in one step, with nothing to install.

**[Live Demo](#)** · No accounts, no uploads to a server — everything runs locally in your browser.

---

## Quick Start

1. Open `index.html` in any modern browser (or visit the deployed URL)
2. Drag and drop your image onto the drop zone (or click to browse)
3. Pick a preset or adjust settings
4. Download the result

That's it. Your files never leave your machine.

---

## What It Does

### Change Logo Colors

Use this when you need the same logo in white-on-dark and black-on-light variants.

| Step | What to do |
|------|-----------|
| 1 | Drop your logo file |
| 2 | Click **Make White** or **Make Black** |
| 3 | Done — the tool auto-detects your logo's colors and swaps them |

For more control, click **Custom Color**, then click any detected color swatch to pick the source, and use the color picker to set the target.

**Color tolerance** (slider, 0–150): Controls how loosely colors are matched. Higher values replace more similar shades. Start around 50 and adjust.

### Remove Backgrounds

Toggle **Remove background** to strip the background from raster images using edge-aware flood-fill detection.

| Control | What it does |
|---------|-------------|
| **Auto** button | Detects the background color from the image corners |
| **Threshold** (5–80) | How aggressively to match background pixels. Higher = removes more |
| **Edge protection** (0–8) | Pulls the removal boundary inward to avoid eating into the logo. Higher = safer edges |

### Touch Up with Brushes

When background removal is on, the **Touchup toolbar** appears:

- **Restore** — Paint over areas that were incorrectly removed to bring them back (green cursor)
- **Erase** — Paint over areas that were missed to remove them (red cursor)
- **Off** — Return to the before/after comparison slider
- **Size slider** — Adjust brush diameter (5–80 px)

The brush is soft-edged (stronger in the center, fading at edges) for natural results.

### Enhance & Upscale

Toggle **Enhance & upscale** to increase resolution:

- **2x** — Double the dimensions
- **4x** — Quadruple the dimensions

Uses bicubic interpolation with unsharp-mask sharpening to keep edges crisp.

---

## Preview & Compare

### Background Preview

Switch the preview background to check how your logo looks in context:

- **Transparent** — Checkerboard pattern (default)
- **Dark** — Dark navy background
- **Light** — Near-white background

### Before / After Slider

Drag the purple handle left and right to compare before and after.

### Comparison Modes

Use the **Compare** dropdown to isolate specific edits:

| Mode | Left side | Right side |
|------|-----------|------------|
| **Original vs Final** | Unedited image | All edits combined |
| **Original vs Color Only** | Unedited image | Color replacement only |
| **Original vs BG Removed** | Unedited image | Background removal only |
| **Pre-upscale vs Upscaled** | Before upscale | After upscale (at full resolution) |

---

## Zoom, Pan & Undo

### Zoom

| Action | How |
|--------|-----|
| Zoom in/out | Scroll wheel over the preview |
| Zoom in/out (buttons) | Click **+** / **−** in the toolbar |
| Fit to view | Click **Fit** or press `Ctrl/Cmd + 0` |
| Keyboard zoom | `Ctrl/Cmd + =` to zoom in, `Ctrl/Cmd + -` to zoom out |

### Pan

| Action | How |
|--------|-----|
| Pan around | Hold **Space** and drag |
| Pan (alt) | Middle-mouse-button drag |

### Undo / Redo (Brush Strokes)

| Action | How |
|--------|-----|
| Undo | Click **↺** or press `Ctrl/Cmd + Z` |
| Redo | Click **↻** or press `Ctrl/Cmd + Shift + Z` (or `Ctrl/Cmd + Y`) |

Up to 30 brush stroke states are saved. Click the **?** button in the toolbar to see all shortcuts at a glance.

---

## Supported Formats

| Format | Input | Output |
|--------|-------|--------|
| SVG | Yes | SVG |
| PNG | Yes | PNG |
| JPG / JPEG | Yes | PNG |
| WebP | Yes | PNG |
| AVIF | Yes | PNG |
| GIF | Yes | PNG |
| BMP | Yes | PNG |
| TIFF / TIF | Yes | PNG |
| ICO | Yes | PNG |

All raster formats are converted to **max-quality PNG** on download. SVGs stay as SVGs with the color edits applied directly to the markup.

---

## Download

Click the **Download** button to save your processed image. The filename is automatically generated from your original file with `_modified` appended.

The download info line shows you the output format, dimensions, and whether upscaling was applied.

---

## Technical Notes

- **Zero dependencies** — Single self-contained HTML file, no build tools, no frameworks
- **Runs offline** — Once loaded, no network connection needed
- **Privacy first** — Nothing is uploaded; all processing happens in-browser via Canvas API
- **SVG processing** — Colors are replaced by walking the DOM tree (fill, stroke, inline styles, `<style>` blocks, gradient stops)
- **Raster processing** — Pixel-level manipulation via `getImageData` / `putImageData`, chunked with `requestAnimationFrame` to keep the UI responsive
- **Background removal** — BFS flood-fill from image edges with interior hole detection (catches enclosed areas like inside A, R, D letterforms) and morphological erosion for edge protection

---

## Deploy

This is a static site — just serve `index.html`. No build step required.

**Vercel (via GitHub):**
1. Import the repo at [vercel.com/new](https://vercel.com/new)
2. Framework: **Other**
3. Build command: leave empty
4. Output directory: `./`
5. Deploy

**Vercel CLI:**
```bash
npx vercel        # preview deploy
npx vercel --prod # production deploy
```

**Any static host:** Just upload `index.html` — Netlify, GitHub Pages, S3, or even open it directly from your filesystem.
