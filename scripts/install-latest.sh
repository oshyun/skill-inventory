#!/bin/bash
cd "$(dirname "$0")/.."
code --install-extension "$(ls -t skill-inventory-*.vsix | head -1)" --force

