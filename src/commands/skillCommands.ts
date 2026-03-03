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

    // Setup repository command — guided InputBox workflow (7 steps)
    context.subscriptions.push(
        vscode.commands.registerCommand('skillInventory.setupRepository', async () => {
            // Step 1: Repository URL (required)
            const repoUrl = await vscode.window.showInputBox({
                title: 'Setup Repository (1/7)',
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

            // Step 2: PAT (optional, stored in SecretStorage — never written to settings.json)
            const pat = await vscode.window.showInputBox({
                title: 'Setup Repository (2/7)',
                prompt: 'Enter your Personal Access Token (PAT)',
                placeHolder: 'Required for private repositories. Leave blank for public.',
                password: true,
                ignoreFocusOut: true,
            });

            if (pat === undefined) {
                return; // User cancelled
            }

            // Step 3: Branch
            const currentBranch = vscode.workspace
                .getConfiguration('skillInventory.source')
                .get<string>('branch', 'master');
            const branch = await vscode.window.showInputBox({
                title: 'Setup Repository (3/7)',
                prompt: 'Enter the branch name to read skills from',
                placeHolder: 'main',
                value: currentBranch,
                ignoreFocusOut: true,
                validateInput: (value) => {
                    if (!value.trim()) {
                        return 'Branch name is required.';
                    }
                    return undefined;
                },
            });

            if (branch === undefined) {
                return; // User cancelled
            }

            // Step 4: Skills path
            const currentSkillsPath = vscode.workspace
                .getConfiguration('skillInventory.source')
                .get<string>('skillsPath', 'skills');
            const skillsPath = await vscode.window.showInputBox({
                title: 'Setup Repository (4/7)',
                prompt: 'Path in the repository where skill folders are located. Use / for repo root.',
                placeHolder: 'skills',
                value: currentSkillsPath,
                ignoreFocusOut: true,
            });

            if (skillsPath === undefined) {
                return; // User cancelled
            }

            // Step 5: Sync target paths
            const TARGET_PATHS: { label: string; picked: boolean }[] = [
                { label: '.agents/skills',  picked: false },
                { label: '.claude/skills',  picked: true  },
                { label: '.github/skills',  picked: false },
                { label: '~/.agents/skills', picked: false },
                { label: '~/.claude/skills', picked: true  },
                { label: '~/.github/skills', picked: false },
            ];

            const selectedPaths = await vscode.window.showQuickPick(TARGET_PATHS, {
                title: 'Setup Repository (5/7)',
                placeHolder: 'Select sync target paths',
                canPickMany: true,
                ignoreFocusOut: true,
            });

            if (selectedPaths === undefined) {
                return; // User cancelled
            }

            // Step 6: Remove stale skills option
            const staleAnswer = await vscode.window.showWarningMessage(
                'Automatically delete local skills that are removed from the remote repository?',
                {
                    modal: true,
                    detail: 'When enabled, you will always be prompted to confirm before anything is deleted — so it\'s safe to turn on.\n\nWhen disabled, stale skills remain on disk and a warning is shown instead.',
                },
                'Enable (recommended)',
                'Disable'
            );

            if (staleAnswer === undefined) {
                return; // User cancelled
            }

            // Step 7: Auto sync
            const autoSyncAnswer = await vscode.window.showInformationMessage(
                'Enable auto-sync?',
                {
                    modal: true,
                    detail: 'When enabled, the extension periodically checks the remote for changes and syncs automatically.\n\nYou can adjust the interval in settings (default: 30s).',
                },
                'Enable (recommended)',
                'Disable'
            );

            if (autoSyncAnswer === undefined) {
                return; // User cancelled
            }

            // Save PAT first so it is available when subsequent config updates trigger a refresh
            if (pat) {
                await context.secrets.store('skillInventory.pat', pat.trim());
            }

            // Save source settings (each triggers onDidChangeConfiguration → refresh)
            const sourceConfig = vscode.workspace.getConfiguration('skillInventory.source');
            await sourceConfig.update('repoUrl', repoUrl.trim(), vscode.ConfigurationTarget.Global);
            await sourceConfig.update('branch', branch.trim() || 'master', vscode.ConfigurationTarget.Global);
            await sourceConfig.update('skillsPath', skillsPath.trim(), vscode.ConfigurationTarget.Global);

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
            await vscode.workspace.getConfiguration('skillInventory.sync').update(
                'autoSync',
                autoSyncAnswer === 'Enable (recommended)',
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
            await skillsTreeProvider.refresh(true);
        })
    );

    // Change PAT command — update PAT only without re-running full setup
    context.subscriptions.push(
        vscode.commands.registerCommand('skillInventory.changePat', async () => {
            const pat = await vscode.window.showInputBox({
                title: 'Change Personal Access Token (PAT)',
                prompt: 'Enter your new Personal Access Token (PAT)',
                placeHolder: 'Leave blank to remove the Personal Access Token (PAT) for public repositories',
                password: true,
                ignoreFocusOut: true,
            });

            if (pat === undefined) {
                return; // User cancelled
            }

            if (pat.trim()) {
                await context.secrets.store('skillInventory.pat', pat.trim());
            } else {
                await context.secrets.delete('skillInventory.pat');
            }

            // Reload config with the new PAT before refreshing to avoid a 401 flash
            await githubService.refreshConfig();
            vscode.window.showInformationMessage('Personal Access Token (PAT) updated. Refreshing skills...');
            await skillsTreeProvider.refresh();
        })
    );

    // Keep local skill command
    context.subscriptions.push(
        vscode.commands.registerCommand('skillInventory.ignoreSkill', async (node: TreeNode) => {
            await updateKeepLocalSkills(node, skillsTreeProvider, (kept, localPath) =>
                kept.includes(localPath) ? kept : [...kept, localPath]
            );
        })
    );

    // Release local skill command
    context.subscriptions.push(
        vscode.commands.registerCommand('skillInventory.unignoreSkill', async (node: TreeNode) => {
            await updateKeepLocalSkills(node, skillsTreeProvider, (kept, localPath) =>
                kept.filter(s => s !== localPath)
            );
        })
    );

}

async function updateKeepLocalSkills(
    node: TreeNode,
    provider: SkillsTreeProvider,
    update: (kept: string[], localPath: string) => string[]
): Promise<void> {
    if (!node || node.type !== 'skill') {
        return;
    }
    const localPath = node.skill.localPath || node.skill.id;
    const config = vscode.workspace.getConfiguration('skillInventory.sync');
    const kept = config.get<string[]>('keepLocalSkills', []);
    await config.update('keepLocalSkills', update(kept, localPath), vscode.ConfigurationTarget.Global);
    provider.refreshTree();
}
