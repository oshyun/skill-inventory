#!/bin/bash
cd "$(dirname "$0")/.."
npx tsc --noEmit && node scripts/bump-version.js && npx vsce package --allow-missing-repository && git restore package.json && rm -rf dist

if [ "$1" = "--install" ]; then
  bash scripts/install-latest.sh
else
  echo ""
  echo "설치하려면 VS Code 터미널에서 실행하세요:"
  echo "  bash scripts/install-latest.sh"
fi
