#!/bin/bash
cd "$(dirname "$0")/.."
node scripts/bump-version.js && npx vsce package --allow-missing-repository && git restore package.json

CODE_CLI=$(ls -t ~/.vscode-server/cli/servers/*/server/bin/remote-cli/code 2>/dev/null | head -1)

if [ "$1" = "--install" ] || [ "$1" = "--reload" ]; then
  bash scripts/install-latest.sh

  if [ "$1" = "--reload" ]; then
    if [ -n "$CODE_CLI" ]; then
      "$CODE_CLI" --command workbench.action.reloadWindow
    else
      echo ""
      echo "리로드하려면 VS Code에서 Ctrl+Shift+P → Developer: Reload Window"
    fi
  fi
else
  echo ""
  echo "설치하려면 VS Code 터미널에서 실행하세요:"
  echo "  bash scripts/install-latest.sh"
fi
