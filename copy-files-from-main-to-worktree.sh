#!/usr/bin/env bash
#
# copy-files-from-main-to-worktree.sh
#
# Run this from inside a worktree.
# Copies a few specific files from the main project root into the current directory.
#

set -euo pipefail

# List of files to copy (relative paths from project root)
FILES_TO_COPY=(
    ".env"
)

# ────────────────────────────────────────────────

# Find the main project root (first worktree listed is always the main one)
MAIN_ROOT=$(git worktree list | head -1 | awk '{print $1}')

if [[ -z "$MAIN_ROOT" ]]; then
    echo "Error: Could not find main worktree" >&2
    exit 1
fi

echo "Main project root: $MAIN_ROOT"
echo "Current directory: $(pwd)"
echo ""

# Check that we're not already in the main worktree
if [[ "$(realpath "$(pwd)")" == "$MAIN_ROOT" ]]; then
    echo "You appear to be in the main worktree."
    echo "This script is meant to be run from a linked worktree."
    exit 1
fi

copied=0
skipped=0

for file in "${FILES_TO_COPY[@]}"; do
    src="$MAIN_ROOT/$file"
    dest="./$file"

    if [[ ! -f "$src" ]]; then
        echo "Not found in main project → $file"
        continue
    fi

    if [[ -f "$dest" ]]; then
        echo "Already exists → $file  (skipping)"
        ((skipped++))
        continue
    fi

    mkdir -p "$(dirname "$dest")" 2>/dev/null || true
    cp -v "$src" "$dest"
    ((copied++))
done

echo ""
echo "Done."
echo "Copied:  $copied file(s)"
echo "Skipped: $skipped file(s) (already exist)"
