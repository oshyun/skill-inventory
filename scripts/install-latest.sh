#!/bin/bash
cd "$(dirname "$0")/.."
code --install-extension "$(ls -t skill-inventory-*.vsix | head -1)" --force

if [ "$1" = "--reload" ]; then
  code --command workbench.action.reloadWindow
fi
