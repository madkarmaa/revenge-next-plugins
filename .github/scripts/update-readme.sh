#!/usr/bin/env bash

set -euo pipefail

python3 .github/scripts/update-readme.py

if git diff --quiet -- README.md; then
    exit 0
fi

git -c user.name='github-actions[bot]' \
    -c user.email='github-actions[bot]@users.noreply.github.com' \
    -c commit.gpgsign=false \
    commit --only -m 'docs: update plugin list' -- README.md
git push origin HEAD:main
