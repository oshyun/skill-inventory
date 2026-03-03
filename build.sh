#!/bin/bash
cd "$(dirname "$0")"
node scripts/bump-version.js && npx vsce package --allow-missing-repository && git restore package.json

VSIX=$(ls -t skill-inventory-*.vsix | head -1)

if [ "$1" = "--install" ]; then
  code --install-extension "$VSIX" --force
else
  echo ""
  echo "설치하려면 VS Code 터미널에서 실행하세요:"
  echo "  code --install-extension $VSIX --force"
fi
