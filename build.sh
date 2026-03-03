#!/bin/bash
cd "$(dirname "$0")"
node scripts/bump-version.js && npx vsce package --allow-missing-repository && git restore package.json

if [ "$1" = "--install" ]; then
  CODE_BIN=$(ls -td ~/.vscode-server/cli/servers/Stable-*/server/bin/remote-cli/code 2>/dev/null | head -1)
  if [ -z "$CODE_BIN" ]; then
    CODE_BIN=$(which code 2>/dev/null)
  fi
  if [ -z "$CODE_BIN" ]; then
    echo "ERROR: code 명령어를 찾을 수 없습니다."
    exit 1
  fi
  "$CODE_BIN" --install-extension "$(ls -t skill-inventory-*.vsix | head -1)" --force
fi
