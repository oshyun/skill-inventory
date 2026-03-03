# Skill Inventory

Fetch skills from a GitHub repository and automatically sync them to local paths where AI agents (Claude Code, GitHub Copilot, etc.) can reference them.

## Features

- **Skills Tree View** — Browse all skills from the source repository in a dedicated Activity Bar panel
- **Auto Sync** — Periodically detects remote changes and keeps local skills up to date
- **Multi-target Sync** — Sync to multiple paths at once (`.claude/skills`, `~/.claude/skills`, `.github/skills`, etc.)
- **Guided Setup** — Step-by-step wizard to configure the repository, branch, and sync paths
- **GitHub Enterprise** — Supports both GitHub.com and GitHub Enterprise URLs

## Getting Started

1. Open the **Skill Inventory** panel in the Activity Bar
2. Click **Setup Repository** (or run `Skill Inventory: Setup Repository` from the Command Palette)
3. Follow the setup wizard: repository URL → PAT (if private) → branch → sync paths
4. Skills are fetched and synced automatically

## Configuration

### Source

| Setting                            | Description                                            |
| ---------------------------------- | ------------------------------------------------------ |
| `skillInventory.source.repoUrl`    | GitHub (or GitHub Enterprise) repository URL           |
| `skillInventory.source.branch`     | Branch to read from (default: `master`)                |
| `skillInventory.source.skillsPath` | Skills root path inside the repo (default: `skills`)   |

> **PAT (Personal Access Token):** Stored securely in VS Code's built-in SecretStorage — never written to `settings.json`. Set or update it via **Skill Inventory: Change PAT** or the setup wizard.

### Sync

| Setting                                  | Default | Description                                                                       |
| ---------------------------------------- | ------- | --------------------------------------------------------------------------------- |
| `skillInventory.sync.autoSync`           | `true`  | Enable periodic auto sync. **Disabling this deletes all locally synced skills.**  |
| `skillInventory.sync.intervalSeconds`    | `30`    | Polling interval in seconds (min: 30)                                             |
| `skillInventory.sync.removeStaleSkills`  | `true`  | When enabled, skills removed from remote are flagged for deletion (with prompt)   |
| `skillInventory.sync.keepLocalSkills`    | `[]`    | Skill folder names to keep locally even if deleted from remote. Right-click a skill in the tree view to manage. |

> **Note:** Regardless of `removeStaleSkills`, any local skill file matching a remote skill will be overwritten on sync. Local edits are not preserved.
>
> **Stale deletion prompt** offers three options: **Delete**, **Skip This Time**, or **Always Keep Local** (adds to `keepLocalSkills`).

### Target

Controls which local paths skills are synced to. Use `true` to enable, `false` to disable.

Relative paths (e.g. `.claude/skills`) resolve to the current workspace root. Paths starting with `~/` resolve to the user's home directory.

A `.gitignore` is automatically created in each enabled target path to prevent accidental commits.

Default:

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

| Command                                              | Description                                      |
| ---------------------------------------------------- | ------------------------------------------------ |
| `Skill Inventory: Refresh Skills`                    | Fetch latest skills from the source repository   |
| `Skill Inventory: Configure Repository`              | Open settings filtered to Skill Inventory        |
| `Skill Inventory: Setup Repository`                  | Run the guided setup wizard                      |
| `Skill Inventory: Change PAT (Personal Access Token)` | Update or remove the stored PAT                  |
| `Skill Inventory: Protect Local (Ignore Remote Updates)` | Prevent a skill from being overwritten by remote sync |
| `Skill Inventory: Unprotect Local (Resume Remote Sync)`  | Resume normal remote sync for a protected skill  |

## License

MIT
