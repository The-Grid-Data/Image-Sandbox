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

### Sign: Single File Architecture
- **Trigger**: When adding new features
- **Instruction**: This project is a single self-contained index.html. All HTML, CSS, and JS must stay in one file. No external dependencies
- **Added after**: Core architecture decision
