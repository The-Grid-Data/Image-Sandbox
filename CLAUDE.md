# Image Sandbox

## Ralph Methodology

This project uses the **Ralph autonomous development methodology**. Ralph treats LLM context like memory - it cannot be freed, only rotated. State persists in files and git, not in conversation context.

### Before Every Action

**ALWAYS read these files first:**
1. `RALPH_TASK.md` - Current task and completion criteria
2. `.ralph/guardrails.md` - Lessons from past failures (FOLLOW THESE)
3. `.ralph/progress.md` - What's been accomplished so far
4. `.ralph/errors.log` - Recent failures to avoid

### Working Protocol

1. Find the next unchecked criterion in RALPH_TASK.md (look for `[ ]`)
2. Focus on ONE criterion at a time - complete it fully before moving on
3. Run tests after changes (check RALPH_TASK.md for test_command)
4. Mark completed: change `[ ]` to `[x]` in RALPH_TASK.md
5. Update `.ralph/progress.md` with what you accomplished
6. Commit your changes with descriptive message

### Git Protocol

Commit early and often:
- After completing each criterion: `git add -A && git commit -m "ralph: description"`
- Before any risky refactor: commit current state as checkpoint
- Your commits ARE your memory across sessions

### Signals

- When ALL criteria show `[x]`: **"RALPH COMPLETE - all criteria satisfied"**
- If stuck 3+ times on same issue: **"RALPH GUTTER - need fresh context"**

## ⚠️ THIS IS A DEPLOYMENT MIRROR — NOT THE DEV SOURCE

**Development happens in:** `~/Documents/GridRepos/DataMVP-Area/apps/image-sandbox/`

This repo (`The-Grid-Data/Image-Sandbox`) exists solely as a standalone Vercel deployment target.
**Never edit files here directly.** Make changes in DataMVP-Area, then sync and deploy:

```bash
scripts/sync-from-datamvp.sh   # copies all files from DataMVP-Area
vercel --prod                   # deploys to image-sandbox-sigma.vercel.app
```

## Repository
- This repo (deployment target): https://github.com/The-Grid-Data/Image-Sandbox.git
- Dev source: https://github.com/The-Grid-Data/DataMVP-Area (under `apps/image-sandbox/`)
- Original upstream: https://github.com/wcfcarolina13/Image-Sandbox (forked at SHA `025c2a7`)

## Architecture

Multi-file structure using `window.App` global namespace (no bundler):

```
index.html          — HTML shell + script/style includes
styles.css          — all CSS
api/
  proxy.js          — Vercel function: proxies image URL loads (CORS workaround)
js/
  state.js          — window.App namespace, state object, $ helper, App.dom cache
  utils.js          — showToast, showProgress, hideProgress, color math
  comparison.js     — updateComparisonLayers, renderCanvasToLayer, updateSlider
  zoom-pan.js       — setZoom, zoomToFit, applyZoomTransform, undo/redo
  upscale.js        — upscaleCanvas, blurImageData, AI upscale (ESRGAN)
  bg-removal.js     — flood-fill mask, erosion, raster processing, brush tools
  color-replacement.js — SVG processing, replaceSVGColors, removeSVGBackgrounds
  color-detection.js   — detectSVGColors, detectRasterColors, renderSwatches
  file-handling.js     — handleFile, loadSVG, loadRaster, URL input, resetState
  download.js          — downloadSVG, downloadRaster, downloadBlob
  canvas-export.js     — Icon 512×512 / Logo ×512px / Header 1500×500 presets, export
  svg-editor.js        — inline SVG element select/move/resize/extract
  tutorial.js          — guided tour (first use) + help panel
  app.js               — applyProcessing dispatcher, event wiring (loaded last)
```

### Script Load Order (all `defer`)
state.js → utils.js → comparison.js → zoom-pan.js → upscale.js → bg-removal.js → color-replacement.js → color-detection.js → file-handling.js → download.js → canvas-export.js → svg-editor.js → tutorial.js → app.js

### Namespace Pattern
- `window.App` created in state.js
- Each module registers: `App.utils = {...}`, `App.comparison = {...}`, etc.
- Functions reference each other as `App.moduleName.functionName()`
- DOM refs cached in `App.dom`

## Conventions
- No external dependencies or build tools
- Dark-themed UI (#1a1a2e bg, #a855f7 purple accent)
- Vanilla JS only — no frameworks, no bundlers
- Test command: `for f in js/*.js; do node -c "$f" || exit 1; done && echo OK`

## State Files
```
.ralph/
├── guardrails.md    # Lessons learned ("signs") - READ BEFORE ACTING
├── progress.md      # What's been accomplished
├── errors.log       # Failure history
├── activity.log     # Session activity
└── .iteration       # Current iteration counter (currently: 3)
```
