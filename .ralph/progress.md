# Progress Log

## Summary
- Iterations completed: 3
- Current status: All features implemented. Refactoring to multi-file planned for next session.

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

## File Size Tracking
- index.html: ~3200+ lines (needs refactoring)
- Total feature count: 16 major features
- Git commits: 9 on main branch
