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

## Repository
- Remote: https://github.com/wcfcarolina13/Image-Sandbox.git

## Architecture

**Current (pre-refactor):** Single self-contained `index.html` file (~3200 lines, vanilla HTML/CSS/JS in IIFE, no dependencies).

**Next task:** Refactor into multi-file structure:
- `index.html` — Lean HTML structure + script/style includes
- `styles.css` — All CSS
- `js/` directory — ~11 JS modules using `window.App` global namespace
- See `RALPH_TASK.md` for full refactoring plan and file breakdown

## Conventions
- No external dependencies or build tools
- Dark-themed UI (#1a1a2e bg, #a855f7 purple accent)
- Vanilla JS only — no frameworks, no bundlers
- Test command (current single-file): `node -e "const fs=require('fs');const h=fs.readFileSync('index.html','utf-8');const m=h.match(/<script>([\s\S]*?)<\/script>/);new Function(m[1]);console.log('OK')"`

## State Files
```
.ralph/
├── guardrails.md    # Lessons learned ("signs") - READ BEFORE ACTING
├── progress.md      # What's been accomplished
├── errors.log       # Failure history
├── activity.log     # Session activity
└── .iteration       # Current iteration counter (currently: 3)
```
