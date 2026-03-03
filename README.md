# Skill Inventory

Fetch skills from a GitHub repository and automatically sync them to local paths where AI agents (Claude Code, GitHub Copilot, etc.) can reference them.

## Features

- **Skills Tree View** — Browse all skills from the source repository in a dedicated Activity Bar panel
- **Auto Sync** — Periodically detects remote changes and keeps local skills up to date
- **Multi-target Sync** — Sync to multiple paths at once (`.claude/skills`, `~/.claude/skills`, `.github/skills`, etc.)
- **Guided Setup** — Step-by-step wizard to configure the repository, sync paths, and agent settings

## Getting Started

1. Open the **Skill Inventory** panel in the Activity Bar
2. Click **Setup Repository** (or run `Skill Inventory: Setup Repository` from the Command Palette)
3. Follow the setup wizard: repository URL → PAT (if private) → sync paths → stale skill policy
4. Skills are fetched and synced automatically

## Configuration

### Source

| Setting                            | Description                                           |
| ---------------------------------- | ----------------------------------------------------- |
| `skillInventory.source.repoUrl`    | GitHub repository URL                                 |
| `skillInventory.source.pat`        | Personal Access Token (required for private repos)    |
| `skillInventory.source.branch`     | Branch to read from (default: `master`)               |
| `skillInventory.source.skillsPath` | Skills root path inside the repo (default: `/skills`) |

### Sync

| Setting                                 | Description                                                                      |
| --------------------------------------- | -------------------------------------------------------------------------------- |
| `skillInventory.sync.autoSync`          | Enable periodic auto sync                                                        |
| `skillInventory.sync.intervalSeconds`   | Polling interval in seconds (min: 30)                                            |
| `skillInventory.sync.removeStaleSkills` | Delete local skills that no longer exist in the remote (prompts before deletion) |

> **Note:** Regardless of `removeStaleSkills`, any local skill file with the same name as a remote skill will be overwritten on sync. Local edits are not preserved.

### Target

Controls which local paths skills are synced to. Use `true` to enable, `false` to disable.

Default:

```json
{
  ".claude/skills": true,
  "~/.claude/skills": true,
  ".github/skills": false,
  "~/.github/skills": false,
  ".agents/skills": false,
  "~/.agents/skills": false
}
```

## Commands

| Command                                 | Description                                    |
| --------------------------------------- | ---------------------------------------------- |
| `Skill Inventory: Refresh Skills`       | Fetch latest skills from the source repository |
| `Skill Inventory: Configure Repository` | Open settings filtered to Skill Inventory      |
| `Skill Inventory: Setup Repository`     | Run the guided setup wizard                    |

## License

MIT
