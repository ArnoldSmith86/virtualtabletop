#!/usr/bin/env bash
set -euo pipefail
REPO="${GITHUB_REPOSITORY:?}"
cd "${GITHUB_WORKSPACE:?}"

PREV_TAG=$(gh api "repos/${REPO}/releases/latest" --jq '.tag_name' 2>/dev/null || true)
if [[ -z "$PREV_TAG" ]] || ! git rev-parse -q --verify "${PREV_TAG}^{commit}" &>/dev/null; then
  PREV_REF=$(git log -1 --format=%H --before="$(date -u -d '1 month ago' +%Y-%m-%d)" HEAD 2>/dev/null || true)
  [[ -z "$PREV_REF" ]] && PREV_REF=$(git rev-list --max-parents=0 HEAD)
else
  PREV_REF="$PREV_TAG"
fi

{
  echo "Changes since last month:"
  echo ""
  if ! git log "$PREV_REF"..HEAD --format='%s' | grep -q .; then
    echo "_No new commits in this period._"
  else
    git log "$PREV_REF"..HEAD --reverse --format='- %s' | GITHUB_REPOSITORY="$REPO" python3 -c "
import os, re, sys
repo = os.environ['GITHUB_REPOSITORY']
pat = re.compile(r'#(\d+)\b')
for line in sys.stdin:
    line = line.rstrip()
    print(pat.sub(lambda m: f\"[#{m.group(1)}](https://github.com/{repo}/pull/{m.group(1)})\", line))
"
  fi
} > "${GITHUB_WORKSPACE}/release_notes.md"
