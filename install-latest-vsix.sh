#!/bin/bash
cd "$(dirname "$0")"
node scripts/bump-version.js && npx vsce package --allow-missing-repository && git checkout -- package.json
code --install-extension "$(ls -t skill-inventory-*.vsix | head -1)" --force
