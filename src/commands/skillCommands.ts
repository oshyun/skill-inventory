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
        vscode.commands.registerCommand('fdcSkills.refresh', async () => {
            await skillsTreeProvider.refresh();
        })
    );

    // View skill command — expand skill folder to show contents
    context.subscriptions.push(
        vscode.commands.registerCommand('fdcSkills.viewSkill', async (node: TreeNode) => {
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
        vscode.commands.registerCommand('fdcSkills.openFile', async (file: any) => {
            if (!file || !file.path) {
                vscode.window.showErrorMessage('No file selected');
                return;
            }

            try {
                const document = await vscode.workspace.openTextDocument(file.path);
                await vscode.window.showTextDocument(document, { preview: true });
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to open file: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        })
    );

    // Configure repository command — open VS Code settings filtered to fdcSkills
    context.subscriptions.push(
        vscode.commands.registerCommand('fdcSkills.configure', () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'fdcSkills');
        })
    );

}
