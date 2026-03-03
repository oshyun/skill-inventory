import * as vscode from 'vscode';
import { TreeNode } from '../models/skill';
import { GitHubService } from '../services/githubService';
import { SkillsTreeProvider } from '../providers/skillsTreeProvider';

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
        vscode.commands.registerCommand('skillInventory.refresh', async () => {
            await skillsTreeProvider.refresh();
        })
    );

    // View skill command — expand skill folder to show contents
    context.subscriptions.push(
        vscode.commands.registerCommand('skillInventory.viewSkill', async (node: TreeNode) => {
            if (!node || node.type !== 'skill') {
                vscode.window.showErrorMessage('No skill selected');
                return;
            }
            // Simply select and reveal the node; the tree will expand automatically
            if (skillsTreeProvider['treeView']) {
                skillsTreeProvider['treeView'].reveal(node, { select: true, focus: true, expand: true });
            }
        })
    );

    // Open file command — open a file in the skill folder
    context.subscriptions.push(
        vscode.commands.registerCommand('skillInventory.openFile', async (file: any) => {
            if (!file || !file.path) {
                vscode.window.showErrorMessage('No file selected');
                return;
            }

            try {
                // Try local file first
                const document = await vscode.workspace.openTextDocument(file.path);
                await vscode.window.showTextDocument(document, { preview: true });
            } catch {
                // Local file not found — show in-memory content
                if (file.content) {
                    const lang = file.name?.endsWith('.md') ? 'markdown' : undefined;
                    const document = await vscode.workspace.openTextDocument({ content: file.content, language: lang });
                    await vscode.window.showTextDocument(document, { preview: true });
                } else {
                    vscode.window.showErrorMessage('Cannot open file. Please wait for sync to complete and try again.');
                }
            }
        })
    );

    // Configure repository command — open VS Code settings filtered to skillInventory
    context.subscriptions.push(
        vscode.commands.registerCommand('skillInventory.configure', () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'skillInventory');
        })
    );

    // Setup repository command — guided InputBox workflow
    context.subscriptions.push(
        vscode.commands.registerCommand('skillInventory.setupRepository', async () => {
            // Step 1: Repository URL (required)
            const repoUrl = await vscode.window.showInputBox({
                title: 'Setup Repository (1/4)',
                prompt: 'Enter the GitHub repository URL',
                placeHolder: 'https://github.com/org/repo',
                ignoreFocusOut: true,
                validateInput: (value) => {
                    if (!value.trim()) {
                        return 'Repository URL is required.';
                    }
                    if (!/^https?:\/\/[^/]+\/[^/]+\/[^/]+/.test(value.trim())) {
                        return 'Enter a valid GitHub repository URL. (e.g. https://github.com/org/repo)';
                    }
                    return undefined;
                },
            });

            if (repoUrl === undefined) {
                return; // User cancelled
            }

            // Step 2: PAT (optional)
            const pat = await vscode.window.showInputBox({
                title: 'Setup Repository (2/4)',
                prompt: 'Enter your Personal Access Token (PAT)',
                placeHolder: 'Required for private repositories. Leave blank for public.',
                password: true,
                ignoreFocusOut: true,
            });

            if (pat === undefined) {
                return; // User cancelled
            }

            // Step 3: Sync target paths
            const TARGET_PATHS: { label: string; picked: boolean }[] = [
                { label: '.agents/skills',  picked: false },
                { label: '.claude/skills',  picked: true  },
                { label: '.github/skills',  picked: false },
                { label: '~/.agents/skills', picked: false },
                { label: '~/.claude/skills', picked: true  },
                { label: '~/.github/skills', picked: false },
            ];

            const selectedPaths = await vscode.window.showQuickPick(TARGET_PATHS, {
                title: 'Setup Repository (3/4)',
                placeHolder: 'Select sync target paths',
                canPickMany: true,
                ignoreFocusOut: true,
            });

            if (selectedPaths === undefined) {
                return; // User cancelled
            }

            // Step 4: Remove stale skills option
            const staleAnswer = await vscode.window.showWarningMessage(
                'Automatically delete local skills that are removed from the remote repository?',
                {
                    modal: true,
                    detail: 'When enabled, you will always be prompted to confirm before anything is deleted.\n\nWhen disabled, stale skills remain on disk and a warning is shown instead.',
                },
                'Enable (recommended)',
                'Disable'
            );

            if (staleAnswer === undefined) {
                return; // User cancelled
            }

            // Save to global settings
            const config = vscode.workspace.getConfiguration('skillInventory.source');
            await config.update('repoUrl', repoUrl.trim(), vscode.ConfigurationTarget.Global);
            if (pat) {
                await config.update('pat', pat.trim(), vscode.ConfigurationTarget.Global);
            }
            const targetConfig: Record<string, boolean> = {};
            for (const { label } of TARGET_PATHS) {
                targetConfig[label] = selectedPaths.some(p => p.label === label);
            }
            await vscode.workspace.getConfiguration('skillInventory').update(
                'target',
                targetConfig,
                vscode.ConfigurationTarget.Global
            );
            await vscode.workspace.getConfiguration('skillInventory.sync').update(
                'removeStaleSkills',
                staleAnswer === 'Enable (recommended)',
                vscode.ConfigurationTarget.Global
            );

            // Offer to enable chat.useAgentSkills if currently disabled
            const agentSkillsEnabled = vscode.workspace
                .getConfiguration('chat')
                .get<boolean>('useAgentSkills', false);
            if (!agentSkillsEnabled) {
                const enable = await vscode.window.showInformationMessage(
                    'Chat: Agent Skills Locations is currently disabled. Enable it so AI agents can discover synced skills.',
                    { modal: true },
                    'Enable'
                );
                if (enable === 'Enable') {
                    await vscode.workspace.getConfiguration('chat').update(
                        'useAgentSkills',
                        true,
                        vscode.ConfigurationTarget.Global
                    );
                }
            }

            vscode.window.showInformationMessage('Repository setup complete.');
            await vscode.commands.executeCommand('skillInventory.refresh');
        })
    );

}
