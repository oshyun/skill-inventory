# FDC Skills

VS Code extension for managing FDC skills from a GitHub repository.

## Features

- **Skills Tree View**: View all your FDC skills in a dedicated sidebar panel
- **GitHub Integration**: Store and sync skills with a GitHub repository
- **CRUD Operations**: Create, Read, Update, and Delete skills directly from VS Code
- **GitHub Authentication**: Secure authentication using VS Code's built-in GitHub authentication

## Installation

1. Install the extension from the VS Code Marketplace (or install from VSIX for development)
2. Configure your GitHub repository settings

## Configuration

Open VS Code Settings and configure the following:

- `fdcSkills.github.owner`: GitHub username or organization
- `fdcSkills.github.repo`: Repository name
- `fdcSkills.github.branch`: Branch name (default: `main`)
- `fdcSkills.github.skillsPath`: Path to skills directory (default: `skills`)

Or use the **Configure Repository** command from the command palette.

## Commands

| Command | Description |
|---------|-------------|
| `FDC Skills: Refresh Skills` | Refresh the skills list from GitHub |
| `FDC Skills: Add Skill` | Create a new skill |
| `FDC Skills: Edit Skill` | Edit an existing skill |
| `FDC Skills: Delete Skill` | Delete a skill |
| `FDC Skills: Configure Repository` | Configure GitHub repository settings |
| `FDC Skills: Sync to GitHub` | Sync local changes with GitHub |
| `FDC Skills: View Skill Details` | View detailed information about a skill |

## Skill File Format

Skills are stored as Markdown files with YAML frontmatter:

```markdown
---
id: skill-123456789
name: Code Review
description: Reviews code for best practices
tags: [coding, review]
createdAt: 2024-01-01T00:00:00.000Z
updatedAt: 2024-01-01T00:00:00.000Z
---

Your skill content/prompt goes here...
```

## Development

### Prerequisites

- Node.js 18+
- npm or yarn

### Setup

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch for changes
npm run watch
```

### Running the Extension

1. Press `F5` in VS Code to launch the Extension Development Host
2. The extension will be available in the new VS Code window

### Project Structure

```
src/
├── extension.ts              # Extension entry point
├── providers/
│   └── skillsTreeProvider.ts # Tree view provider for skills
├── services/
│   └── githubService.ts      # GitHub API service
├── models/
│   └── skill.ts              # Skill data model
└── commands/
    └── skillCommands.ts      # Command handlers
```

## License

MIT
