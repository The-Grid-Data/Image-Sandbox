---
task: Logo Color Changer Tool
test_command: "node -e \"const fs=require('fs');const h=fs.readFileSync('index.html','utf-8');const m=h.match(/<script>([\\s\\S]*?)<\\/script>/);new Function(m[1]);console.log('OK')\""
---

# Task: Logo Color Changer Tool

Browser-based tool to quickly edit logo colors for light/dark backgrounds. Single self-contained `index.html` (vanilla HTML/CSS/JS, no dependencies).

## Success Criteria

1. [x] SVG color detection and replacement (fill, stroke, inline styles, style blocks, gradients)
2. [x] Raster color detection (pixel sampling, quantization, clustering)
3. [x] Raster color replacement (per-pixel Euclidean distance with tolerance)
4. [x] Before/after comparison slider preview
5. [x] Quick presets: Make White, Make Black, Custom Color
6. [x] Background removal - edge-aware flood-fill with interior hole detection
7. [x] Morphological edge protection for background removal
8. [x] Restore/Erase brush for manual bg removal touchup
9. [x] Image upscale (2x/4x) with bicubic + sharpening
10. [x] Multi-format support (SVG, PNG, JPG, WebP, AVIF, GIF, BMP, TIFF, ICO)
11. [x] Auto-convert non-PNG to PNG on download at max quality
12. [x] Drag-and-drop + click file upload
13. [x] Download to device
14. [x] Dark theme UI matching workspace conventions
15. [x] Fix upscale canvas offset in preview
16. [ ] Verify all features work end-to-end after fixes

## Architecture
- Single `index.html` file (~2500 lines)
- Vanilla HTML + CSS + JS in IIFE
- No external dependencies
- Dark theme: #1a1a2e bg, #a855f7 purple accent

## Repository
- Remote: https://github.com/wcfcarolina13/Image-Sandbox.git
- Branch: main

## Ralph Instructions

1. Work on the next incomplete criterion (marked `[ ]`)
2. Check off completed criteria (change `[ ]` to `[x]`)
3. Run the test_command after changes
4. Commit your changes frequently with descriptive messages
5. Update `.ralph/progress.md` with what you accomplished
6. When ALL criteria are `[x]`, say: **"RALPH COMPLETE - all criteria satisfied"**
7. If stuck 3+ times on same issue, say: **"RALPH GUTTER - need fresh context"**
