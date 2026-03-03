#!/usr/bin/env node
// Automatically sets package.json version to 0.0.<git-commit-count> before packaging.
// After `npx vsce package`, package.json is restored via `git checkout -- package.json`.
const fs = require('fs');
const { execSync } = require('child_process');

const count = execSync('git rev-list --count HEAD').toString().trim();
const version = `0.0.${count}`;

const pkgPath = './package.json';
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
pkg.version = version;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

console.log(`Version set to ${version}`);
