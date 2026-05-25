#!/usr/bin/env bash
# Sync Image Sandbox from its dev source in DataMVP-Area, then optionally deploy.
#
# Usage:
#   scripts/sync-from-datamvp.sh           # sync only
#   scripts/sync-from-datamvp.sh --deploy  # sync + vercel --prod

set -euo pipefail

SRC="$HOME/Documents/GridRepos/DataMVP-Area/apps/image-sandbox"
DEST="$(cd "$(dirname "$0")/.." && pwd)"

if [[ ! -d "$SRC" ]]; then
  echo "ERROR: source not found at $SRC" >&2
  exit 1
fi

echo "Syncing from $SRC ..."

cp "$SRC/index.html"  "$DEST/index.html"
cp "$SRC/styles.css"  "$DEST/styles.css"
cp "$SRC/js/"*.js     "$DEST/js/"
mkdir -p "$DEST/api"
cp "$SRC/api/"*.js    "$DEST/api/"

echo "Sync complete. Changed files:"
git -C "$DEST" diff --stat

if [[ "${1:-}" == "--deploy" ]]; then
  echo ""
  echo "Committing and deploying to Vercel production ..."
  git -C "$DEST" add index.html styles.css js/ api/
  git -C "$DEST" commit -m "sync: pull latest from DataMVP-Area/apps/image-sandbox" || echo "(nothing to commit)"
  git -C "$DEST" push origin main
  vercel --prod --cwd "$DEST"
fi
