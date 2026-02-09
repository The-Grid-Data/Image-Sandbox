---
task: Image Sandbox - Refactor to Multi-File Architecture
test_command: "for f in js/*.js; do node -c \"$f\" || exit 1; done && echo OK"
---

# Task: Image Sandbox - Refactor to Multi-File Architecture

The single `index.html` has grown to ~3200+ lines. Refactor into a clean multi-file structure while keeping the zero-build-tool approach (vanilla HTML/CSS/JS, no bundler).

## Success Criteria

### Phase 1: File Split
1. [x] Split CSS into `styles.css` (linked via `<link rel="stylesheet">`)
2. [x] Split JS into logical modules loaded via `<script src="">` tags:
   - `js/state.js` — State object + DOM refs
   - `js/utils.js` — Shared helpers (hex/rgb conversion, toast, progress)
   - `js/file-handling.js` — Drop zone, file loading, format detection
   - `js/color-detection.js` — SVG color walking, raster pixel sampling/clustering
   - `js/color-replacement.js` — SVG color replacement, raster per-pixel replacement
   - `js/bg-removal.js` — Flood-fill mask, erosion, brush painting, brush apply
   - `js/upscale.js` — Bicubic upscale + sharpening
   - `js/comparison.js` — Slider, comparison modes, layer rendering
   - `js/zoom-pan.js` — Zoom, pan, undo/redo
   - `js/download.js` — Download logic
   - `js/app.js` — Main init, event wiring, processing dispatcher
3. [x] HTML file is lean (structure + script/style includes only, ~100-200 lines)
4. [ ] All features still work after split (manual end-to-end test)

### Phase 2: Verification
5. [x] Syntax check passes on all JS files
6. [ ] SVG color change works (Make White, Make Black, Custom)
7. [ ] Raster color change works with tolerance slider
8. [ ] Background removal works (auto-detect, threshold, edge protection)
9. [ ] Brush touchup works (restore, erase, undo/redo)
10. [ ] Upscale 2x/4x works and preview aligns correctly
11. [ ] Comparison modes all work (Final, Color Only, BG Removed, Upscale)
12. [ ] Zoom/pan/keyboard shortcuts work
13. [ ] Download works (PNG for raster, SVG for SVG)
14. [ ] Favicon and meta tags preserved

### Phase 3: Cleanup
15. [x] Update CLAUDE.md to reflect new multi-file architecture
16. [ ] Commit and push with descriptive message

## Previous Task (Completed)
All 15 original criteria from the Logo Color Changer build are satisfied.
Added in sessions 2-3: zoom/pan, undo/redo, comparison modes, shortcuts popover, tooltips, favicon, README.

## Architecture Notes

### Sharing State Across Files
Since there's no bundler, use a global namespace pattern:
```js
// In state.js (loaded first):
window.App = { state: { ... }, $: id => document.getElementById(id) };

// In other files:
const { state } = window.App;
```

### Script Load Order
Scripts must load in dependency order. Use `defer` attribute on all `<script>` tags so they execute in order after HTML parsing:
```html
<script src="js/state.js" defer></script>
<script src="js/utils.js" defer></script>
<!-- ... etc ... -->
<script src="js/app.js" defer></script>  <!-- last: wires everything together -->
```

### Key Risks
- IIFE currently wraps everything — unwrapping requires careful scoping
- Event listeners reference many functions across what will become separate files
- The `currentRunId` cancellation pattern spans processing + rendering
- Brush mask state is read/written from multiple places (paint, apply, undo, processing reset)

## Repository
- Remote: https://github.com/wcfcarolina13/Image-Sandbox.git
- Branch: main
