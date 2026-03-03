# Skill Inventory

VS Code extension that fetches skills from a Git repository and syncs them to local paths for AI agents (Claude Code, GitHub Copilot, etc.) to reference.

## Features

- **Skills Tree View**: View all skills from the source repository in a dedicated sidebar panel
- **Auto Sync**: Periodically detects remote changes and syncs skills to configured local paths
- **Multi-target Sync**: Sync to multiple paths simultaneously (`.claude/skills`, `~/.claude/skills`, `.github/skills`, etc.)
- **Guided Setup**: Step-by-step setup wizard for repository, sync paths, and agent settings

## Installation

Install from VSIX:

```bash
code --install-extension skill-inventory-x.x.x.vsix --force
```

## Configuration

Settings are organized into three sections:

### Source
| Key | Description |
|-----|-------------|
| `skillInventory.source.repoUrl` | Git repository URL |
| `skillInventory.source.pat` | Personal Access Token (private repos) |
| `skillInventory.source.branch` | Branch name (default: `master`) |
| `skillInventory.source.skillsPath` | Skills root path in the repo (default: `/skills`) |

### Sync
| Key | Description |
|-----|-------------|
| `skillInventory.sync.autoSync` | Enable periodic auto sync |
| `skillInventory.sync.intervalSeconds` | Sync interval in seconds (min: 30) |
| `skillInventory.sync.removeStaleSkills` | Delete local skills removed from remote |

### Target
| Key | Description |
|-----|-------------|
| `skillInventory.target` | Sync target paths as `{"path": true/false}` |

Default targets:

```json
{
  ".agents/skills": false,
  ".claude/skills": true,
  ".github/skills": false,
  "~/.agents/skills": false,
  "~/.claude/skills": true,
  "~/.github/skills": false
}
```

## Commands

| Command | Description |
|---------|-------------|
| `Skill Inventory: Refresh Skills` | Fetch latest skills from the source repository |
| `Skill Inventory: Configure Repository` | Open settings filtered to Skill Inventory |
| `Skill Inventory: 저장소 설정` | Run the guided setup wizard |
| `Skill Inventory: View Skill Details` | Expand and focus a skill node |

## Skill Format

Each skill is a folder in the repository containing a `SKILL.md` file:

```
my-skill/
├── SKILL.md         # YAML frontmatter + markdown body
└── references/      # Optional reference files
    └── *.md
```

`SKILL.md` format:

```markdown
---
name: Code Review
description: Reviews code for best practices
tags: [coding, review]
---

Your skill content goes here...
```

## Development

### Build

```bash
# VSIX packaging
npm run package
# or
bash scripts/build.sh

# TypeScript type check
npx tsc --noEmit
```

### Project Structure

```
src/
├── extension.ts              # Entry point — activate/deactivate, polling loop
├── models/skill.ts           # Data models and markdown parsing utilities
├── services/
│   ├── githubService.ts      # GitHub API client (Octokit)
│   └── copilotService.ts     # Local file sync
├── providers/
│   └── skillsTreeProvider.ts # VS Code TreeDataProvider
└── commands/
    └── skillCommands.ts      # Command handlers

scripts/
├── bump-version.js           # Auto version from git commit count
├── build.sh                  # Build script
└── install-latest.sh         # Install latest VSIX (run from VS Code terminal)
```

## License

MIT
