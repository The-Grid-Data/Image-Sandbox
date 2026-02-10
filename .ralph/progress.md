# Progress Log

## Summary
- Iterations completed: 4
- Current status: Multi-file refactor complete. File split done, syntax checks pass. Needs browser testing for Phase 2 verification.

## Session History

### Iteration 1 - Initial Build & Background Removal Evolution
- **Task**: Build browser-based logo color changer tool
- **Work completed**:
  - Created single-file `index.html` with full HTML/CSS/JS
  - SVG color detection via DOM walking (fill, stroke, inline styles, style blocks, gradient stops)
  - Raster color detection via Canvas pixel sampling with quantization and clustering
  - Color replacement: SVG via attribute/style replacement, Raster via per-pixel Euclidean distance
  - Before/after comparison slider with independent clip-path layers
  - Quick presets: Make White, Make Black, Custom Color
  - Background removal: evolved from per-pixel threshold → flood-fill from edges → edge-aware with interior hole detection → morphological erosion edge protection
  - Restore/Erase brush for manual touchup
  - Image upscale (2x/4x) with bicubic interpolation + unsharp mask sharpening
  - Format support: SVG, PNG, JPG, WebP, AVIF, GIF, BMP, TIFF, ICO
  - Auto-convert non-PNG raster to PNG on download at max quality
  - Dark theme UI (#1a1a2e bg, #a855f7 accent)
  - Drag-and-drop file upload, download to device
- **Key bugs fixed**:
  - Toggle click propagation (div → label)
  - Processing race condition (runId pattern)
  - Comparison layer transparency bleed-through (independent clipping)
  - Background removal only worked for white → configurable color with auto-detect
  - Logo content getting removed → flood-fill from edges
  - Interior holes in letterforms (A, R) not removed → Pass 2 region scanning
  - Checkerboard too high-contrast → subtle #e0e0e0/#f0f0f0
  - Upscale canvas offset → render preview at original dims, keep full-res for download

### Iteration 2 - Zoom/Pan, Undo/Redo, Comparison Modes
- **Task**: Add canvas navigation and comparison improvements
- **Work completed**:
  - Zoom controls: buttons (+, -, Fit), scroll wheel (1.06x gentle step), pinch-to-zoom
  - Pan: Space+drag, middle-mouse drag
  - Keyboard shortcuts: Ctrl+=/- zoom, Ctrl+0 fit, Ctrl+Z undo, Ctrl+Shift+Z redo
  - Undo/redo for brush strokes (up to 30 snapshots of Float32Array mask)
  - Comparison mode dropdown: Original vs Final, Color Only, BG Removed, Pre-upscale vs Upscaled
  - Shortcuts popover (? button) with position:fixed to avoid overflow clipping
  - Dynamic comparison labels update per mode
  - Intermediate canvases built during processing for isolated comparisons
  - Upscale comparison renders at upscaled resolution to show quality difference
  - Moved UI overlays (handle, labels, cursor) outside zoom wrapper for screen-space positioning
- **Key bugs fixed**:
  - Shortcuts popover clipped by preview panel overflow:hidden → moved to body with fixed positioning
  - Upscale comparison showed identical images → render at upscaled resolution
  - Comparison handle/labels invisible → z-index stacking fix (comparisonContent z-index:1, handle/labels z-index:20)
  - Zoom too sensitive → separate ZOOM_SCROLL_STEP (1.06) vs ZOOM_STEP (1.15)
  - Keyboard shortcuts fired in select/input elements → added SELECT to exclusion check

### Iteration 3 - Polish, Favicon, README, Ralph Checkpoint
- **Task**: Prepare for deployment and team use
- **Work completed**:
  - Descriptive tooltips on all major UI controls
  - Inline SVG favicon (purple overlapping circles on dark bg, matches brand)
  - Apple touch icon for mobile bookmarks
  - Meta tags: theme-color, description
  - Renamed app from "Logo Color Changer" to "Image Sandbox"
  - Comprehensive README with usage guide, keyboard shortcuts table, format table, deploy instructions
  - Ralph checkpoint updated with refactoring plan for next session
- **Next task**: Refactor single index.html (~3200 lines) into multi-file architecture
  - Split CSS → styles.css
  - Split JS → ~11 logical module files in js/ directory
  - Use window.App global namespace pattern (no bundler)
  - Script defer loading in dependency order

### Iteration 4 - Multi-File Refactor
- **Task**: Refactor monolithic index.html into multi-file architecture
- **Work completed**:
  - Extracted all CSS (943 lines) to `styles.css`
  - Created 11 JS modules in `js/` directory using `window.App` global namespace
  - `js/state.js` — App namespace, state object, $ helper, App.dom cache (60+ DOM refs)
  - `js/utils.js` — showToast, showProgress, hideProgress, normalizeColor, rgbToHex, hexToRgb, colorDistance, luminance
  - `js/comparison.js` — updateComparisonLayers, renderCanvasToLayer, updateSlider
  - `js/zoom-pan.js` — setZoom, zoomToFit, applyZoomTransform, pushUndo, undo, redo
  - `js/upscale.js` — upscaleCanvas, blurImageData
  - `js/bg-removal.js` — buildEdgeFloodMask, erodeMask, applyRasterProcessing, brush tools, renderOriginalRaster, renderProcessedRaster, autoDetectBgColor (~400 lines, largest module)
  - `js/color-replacement.js` — applySVGProcessing, replaceSVGColors, removeSVGBackgrounds, renderOriginalSVG
  - `js/color-detection.js` — detectSVGColors, detectRasterColors, renderSwatches, selectSourceColor, highlightSwatch
  - `js/file-handling.js` — handleFile, loadSVG, loadRaster, resetState, showEditor
  - `js/download.js` — downloadSVG, downloadRaster, downloadBlob, updateDownloadInfo
  - `js/app.js` — applyProcessing dispatcher, clearPresetButtons, all 40+ event listeners centralized
  - Slimmed `index.html` from ~3130 lines to ~215 lines (HTML shell + script/style includes)
  - All 11 JS files pass `node -c` syntax check
  - Updated CLAUDE.md with new architecture documentation
- **Key design decisions**:
  - `window.App` global namespace — each module registers on `App.moduleName`
  - Module-local `let` vars (brushPainting, panning, currentRunId, dragging, processingTimer) exposed via getter/setter methods
  - All event listeners centralized in app.js init function (loaded last via `defer`)
  - Forward references between modules are safe (called at runtime only, not at parse time)
  - Nested functions (walkNode, pixelDist, processChunk, etc.) stay nested in their parent functions
- Committed as `52d3097` and pushed to GitHub
- **Pending**: Browser testing for Phase 2 verification (criteria 4, 6-14)

## File Size Tracking
- index.html: ~215 lines (down from ~3130)
- styles.css: ~943 lines
- js/ directory: 11 files, ~2000 lines total
- Total feature count: 16 major features
- Git commits: 11 on main branch
