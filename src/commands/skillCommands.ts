import * as vscode from 'vscode';
import { Skill, createSkill } from '../models/skill';
import { GitHubService } from '../services/githubService';
import { SkillsTreeProvider, SkillTreeItem } from '../providers/skillsTreeProvider';

/**
 * Register all skill-related commands
 */
export function registerSkillCommands(
    context: vscode.ExtensionContext,
    githubService: GitHubService,
    skillsTreeProvider: SkillsTreeProvider
): void {
    // Refresh skills command
    context.subscriptions.push(
        vscode.commands.registerCommand('fdcSkills.refresh', async () => {
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Refreshing skills...',
                    cancellable: false,
                },
                async () => {
                    await skillsTreeProvider.refresh();
                }
            );
        })
    );

    // Add skill command
    context.subscriptions.push(
        vscode.commands.registerCommand('fdcSkills.addSkill', async () => {
            if (!githubService.isConfigured()) {
                const config = await vscode.commands.executeCommand('fdcSkills.configure');
                if (!config) {
                    return;
                }
            }

            const name = await vscode.window.showInputBox({
                prompt: 'Enter skill name',
                placeHolder: 'My New Skill',
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'Skill name is required';
                    }
                    return null;
                },
            });

            if (!name) {
                return;
            }

            const description = await vscode.window.showInputBox({
                prompt: 'Enter skill description',
                placeHolder: 'What does this skill do?',
            });

            const tagsInput = await vscode.window.showInputBox({
                prompt: 'Enter tags (comma-separated)',
                placeHolder: 'coding, review, testing',
            });

            const tags = tagsInput?.split(',').map(t => t.trim()).filter(Boolean) || [];

            // Open a new document for entering skill content
            const document = await vscode.workspace.openTextDocument({
                language: 'markdown',
                content: `# ${name}\n\n<!-- Enter your skill content/prompt below -->\n\n`,
            });

            const editor = await vscode.window.showTextDocument(document);

            // Show information about saving
            const saveDisposable = vscode.workspace.onDidSaveTextDocument(async (savedDoc) => {
                if (savedDoc === document) {
                    const content = savedDoc.getText();
                    
                    const skill = createSkill({
                        name,
                        description: description || '',
                        content,
                        tags,
                    });

                    try {
                        await vscode.window.withProgress(
                            {
                                location: vscode.ProgressLocation.Notification,
                                title: 'Creating skill...',
                                cancellable: false,
                            },
                            async () => {
                                await githubService.createSkill(skill);
                                await skillsTreeProvider.refresh();
                            }
                        );

                        vscode.window.showInformationMessage(`Skill "${name}" created successfully!`);
                        saveDisposable.dispose();
                        
                        // Close the editor
                        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                    } catch (error) {
                        vscode.window.showErrorMessage(`Failed to create skill: ${error instanceof Error ? error.message : 'Unknown error'}`);
                    }
                }
            });

            // Clean up on editor close without saving
            const closeDisposable = vscode.window.onDidChangeActiveTextEditor((newEditor) => {
                if (newEditor?.document !== document && editor.document === document) {
                    saveDisposable.dispose();
                    closeDisposable.dispose();
                }
            });

            vscode.window.showInformationMessage('Edit your skill content and save to create the skill.');
        })
    );

    // Edit skill command
    context.subscriptions.push(
        vscode.commands.registerCommand('fdcSkills.editSkill', async (item: SkillTreeItem) => {
            if (!item || !item.skill) {
                vscode.window.showErrorMessage('No skill selected');
                return;
            }

            const skill = item.skill;

            // Open skill content in a new document
            const document = await vscode.workspace.openTextDocument({
                language: 'markdown',
                content: skill.content,
            });

            const editor = await vscode.window.showTextDocument(document);

            // Listen for save
            const saveDisposable = vscode.workspace.onDidSaveTextDocument(async (savedDoc) => {
                if (savedDoc === document) {
                    const updatedSkill: Skill = {
                        ...skill,
                        content: savedDoc.getText(),
                        updatedAt: new Date().toISOString(),
                    };

                    try {
                        await vscode.window.withProgress(
                            {
                                location: vscode.ProgressLocation.Notification,
                                title: 'Updating skill...',
                                cancellable: false,
                            },
                            async () => {
                                await githubService.updateSkill(updatedSkill);
                                await skillsTreeProvider.refresh();
                            }
                        );

                        vscode.window.showInformationMessage(`Skill "${skill.name}" updated successfully!`);
                        saveDisposable.dispose();
                        
                        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                    } catch (error) {
                        vscode.window.showErrorMessage(`Failed to update skill: ${error instanceof Error ? error.message : 'Unknown error'}`);
                    }
                }
            });

            vscode.window.showInformationMessage('Edit the skill content and save to update.');
        })
    );

    // Delete skill command
    context.subscriptions.push(
        vscode.commands.registerCommand('fdcSkills.deleteSkill', async (item: SkillTreeItem) => {
            if (!item || !item.skill) {
                vscode.window.showErrorMessage('No skill selected');
                return;
            }

            const skill = item.skill;

            const confirm = await vscode.window.showWarningMessage(
                `Are you sure you want to delete "${skill.name}"?`,
                { modal: true },
                'Delete'
            );

            if (confirm !== 'Delete') {
                return;
            }

            try {
                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: 'Deleting skill...',
                        cancellable: false,
                    },
                    async () => {
                        await githubService.deleteSkill(skill);
                        await skillsTreeProvider.refresh();
                    }
                );

                vscode.window.showInformationMessage(`Skill "${skill.name}" deleted successfully!`);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to delete skill: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        })
    );

    // View skill command
    context.subscriptions.push(
        vscode.commands.registerCommand('fdcSkills.viewSkill', async (item: SkillTreeItem) => {
            if (!item || !item.skill) {
                vscode.window.showErrorMessage('No skill selected');
                return;
            }

            const skill = item.skill;

            // Create a virtual document to display skill details
            const content = `# ${skill.name}

## Description
${skill.description || 'No description provided.'}

## Tags
${skill.tags && skill.tags.length > 0 ? skill.tags.join(', ') : 'No tags'}

## Content
\`\`\`
${skill.content}
\`\`\`

---
**ID:** ${skill.id}
**Created:** ${skill.createdAt || 'Unknown'}
**Updated:** ${skill.updatedAt || 'Unknown'}
`;

            const document = await vscode.workspace.openTextDocument({
                language: 'markdown',
                content,
            });

            await vscode.window.showTextDocument(document, { preview: true });
        })
    );

    // Configure repository command
    context.subscriptions.push(
        vscode.commands.registerCommand('fdcSkills.configure', async () => {
            const config = vscode.workspace.getConfiguration('fdcSkills.github');

            const repoUrl = await vscode.window.showInputBox({
                prompt: 'Enter GitHub Enterprise repository URL',
                value: config.get('repoUrl', ''),
                placeHolder: 'https://github.example.com/org/repo.git',
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'Repository URL is required';
                    }
                    return null;
                },
            });

            if (repoUrl === undefined) {
                return;
            }

            const pat = await vscode.window.showInputBox({
                prompt: 'Enter GitHub Personal Access Token (PAT)',
                value: config.get('pat', ''),
                placeHolder: 'REDACTED',
                password: true,
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'PAT is required';
                    }
                    return null;
                },
            });

            if (pat === undefined) {
                return;
            }

            const branch = await vscode.window.showInputBox({
                prompt: 'Enter branch name',
                value: config.get('branch', 'main'),
                placeHolder: 'main',
            });

            if (branch === undefined) {
                return;
            }

            const skillsPath = await vscode.window.showInputBox({
                prompt: 'Enter path to skills directory (use / for root)',
                value: config.get('skillsPath', 'skills'),
                placeHolder: 'skills',
            });

            if (skillsPath === undefined) {
                return;
            }

            // Save configuration
            await config.update('repoUrl', repoUrl, vscode.ConfigurationTarget.Global);
            await config.update('pat', pat, vscode.ConfigurationTarget.Global);
            await config.update('branch', branch, vscode.ConfigurationTarget.Global);
            await config.update('skillsPath', skillsPath, vscode.ConfigurationTarget.Global);

            // Refresh the GitHub service configuration
            githubService.refreshConfig();

            // Test connection
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Testing connection...',
                    cancellable: false,
                },
                async () => {
                    const connected = await githubService.testConnection();
                    if (connected) {
                        vscode.window.showInformationMessage('Successfully connected to GitHub repository!');
                        await skillsTreeProvider.refresh();
                    } else {
                        vscode.window.showErrorMessage('Failed to connect to GitHub repository. Please check your settings.');
                    }
                }
            );

            return { repoUrl, pat, branch, skillsPath };
        })
    );

    // Sync to GitHub command
    context.subscriptions.push(
        vscode.commands.registerCommand('fdcSkills.syncToGitHub', async () => {
            if (!githubService.isConfigured()) {
                vscode.window.showWarningMessage('GitHub repository not configured. Please configure repository settings first.');
                return;
            }

            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Syncing with GitHub...',
                    cancellable: false,
                },
                async () => {
                    try {
                        await skillsTreeProvider.refresh();
                        vscode.window.showInformationMessage('Skills synced with GitHub successfully!');
                    } catch (error) {
                        vscode.window.showErrorMessage(`Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                    }
                }
            );
        })
    );
}
