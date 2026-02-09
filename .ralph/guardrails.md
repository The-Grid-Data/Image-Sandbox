# Ralph Guardrails (Signs)

> Lessons learned from past failures. READ THESE BEFORE ACTING.

## Core Signs

### Sign: Read Before Writing
- **Trigger**: Before modifying any file
- **Instruction**: Always read the existing file first to understand context
- **Added after**: Core principle

### Sign: Test After Changes
- **Trigger**: After any code change
- **Instruction**: Run JS syntax check: `node -e "new Function(html.match(/<script>([\s\S]*?)<\/script>/)[1])"`
- **Added after**: Core principle

### Sign: Commit Checkpoints
- **Trigger**: Before risky changes
- **Instruction**: Commit current working state first
- **Added after**: Core principle

### Sign: One Task Focus
- **Trigger**: When context grows large
- **Instruction**: Focus on single criterion, complete it, commit, move on
- **Added after**: Core principle - prevents context pollution

### Sign: Update Progress
- **Trigger**: After completing any criterion
- **Instruction**: Update .ralph/progress.md AND check off the criterion in RALPH_TASK.md
- **Added after**: Core principle - enables continuation across sessions

---

## Learned Signs

### Sign: Toggle Elements Need Labels
- **Trigger**: When implementing toggle switches
- **Instruction**: Use `<label>` wrapping with `for` attribute, not `<div>`, so clicks on the visual switch propagate to the hidden checkbox
- **Added after**: Iteration 1 - toggle bg removal didn't work because span covered checkbox

### Sign: Comparison Layers Must Not Overlap
- **Trigger**: When working on before/after comparison preview
- **Instruction**: Both layers must be `position: absolute` with independent `clip-path`. Never stack with z-index where one covers the other — transparent pixels would reveal the wrong layer instead of the checkerboard
- **Added after**: Iteration 1 - bg removal appeared broken because transparent pixels showed original image underneath

### Sign: Flood-Fill From Edges for Background Removal
- **Trigger**: When background pixels are colorimetrically close to logo content
- **Instruction**: Use BFS flood-fill from image edges rather than per-pixel threshold. Add Pass 2 for interior holes (letterforms). Use morphological erosion for edge protection
- **Added after**: Iteration 1 - per-pixel threshold removed logo content that shared colors with background

### Sign: Canvas Dimensions Must Match When Upscaling
- **Trigger**: When implementing upscale/enhance with comparison preview
- **Instruction**: The sizer, original layer, and processed layer canvases must all be consistent. If upscale changes dimensions, the display canvas must still use CSS constraints (max-width/max-height/object-fit) to match visually
- **Added after**: Iteration 1 - upscale caused canvas offset in preview

### Sign: Z-Index Stacking With CSS Transforms
- **Trigger**: When elements with position:absolute are siblings of a CSS-transformed wrapper
- **Instruction**: A CSS `transform` on an element creates a new stacking context. Set explicit `z-index` on the transformed wrapper (low, e.g. 1) and higher z-index on sibling overlays (e.g. 20). DOM order alone is NOT enough
- **Added after**: Iteration 2 - comparison handle and labels were invisible because comparisonContent's transform created a stacking context that painted over them

### Sign: Fixed Position for Popovers in Overflow:Hidden Parents
- **Trigger**: When adding popover/tooltip/dropdown that must escape its container
- **Instruction**: Use `position: fixed` and calculate coordinates via `getBoundingClientRect()` in JS. Place the popover element at document body level, not inside the clipped container
- **Added after**: Iteration 2 - shortcuts popover was invisible because preview panel had overflow:hidden

### Sign: Upscale Comparison Needs Full Resolution
- **Trigger**: When comparing pre-upscale vs upscaled images
- **Instruction**: Render BOTH sides at the upscaled resolution. If you render at original dimensions, the upscaled canvas gets scaled back down and looks identical to the pre-upscale version
- **Added after**: Iteration 2 - upscale comparison mode showed identical images

### Sign: Multi-File Refactoring Strategy
- **Trigger**: When index.html exceeds ~2000 lines
- **Instruction**: Use `window.App` global namespace pattern. Load scripts with `defer` in dependency order. Split by feature domain (state, utils, color, bg-removal, upscale, zoom, etc.). The IIFE must be unwrapped — all functions become methods on App or standalone globals
- **Added after**: Iteration 3 - file grew to 3200+ lines, becoming hard to navigate
