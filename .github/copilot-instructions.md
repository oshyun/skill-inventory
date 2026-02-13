# FDC Skills VS Code Extension

## Project Overview
VS Code extension for managing FDC skills from a GitHub repository.

## Features
- Connect to GitHub repository to fetch skills list
- Display skills in a tree view
- CRUD operations for skills (Create, Read, Update, Delete)
- Sync skills with GitHub repository
- GitHub authentication support

## Development Guidelines
- Use TypeScript for all source code
- Follow VS Code extension best practices
- Use the VS Code API for UI components
- Use Octokit for GitHub API interactions

## Project Structure
```
src/
├── extension.ts          # Extension entry point
├── providers/
│   └── skillsTreeProvider.ts  # Tree view provider for skills
├── services/
│   └── githubService.ts       # GitHub API service
├── models/
│   └── skill.ts               # Skill data model
└── commands/
    └── skillCommands.ts       # Command handlers
```

## Commands
- `fdcSkills.refresh` - Refresh skills list from GitHub
- `fdcSkills.addSkill` - Add a new skill
- `fdcSkills.editSkill` - Edit an existing skill
- `fdcSkills.deleteSkill` - Delete a skill
- `fdcSkills.configure` - Configure GitHub repository settings
