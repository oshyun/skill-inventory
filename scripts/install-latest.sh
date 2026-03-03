#!/bin/bash
cd "$(dirname "$0")/.."
code --install-extension "$(ls -t skill-inventory-*.vsix | head -1)" --force

if [ "$1" = "--reload" ]; then
  echo ""
  echo "설치 완료. VS Code에서 Ctrl+Shift+P → Developer: Reload Window"
fi
