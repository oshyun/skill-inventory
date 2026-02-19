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

    // View skill command — open the local .github/skills/{localPath}/SKILL.md
    context.subscriptions.push(
        vscode.commands.registerCommand('fdcSkills.viewSkill', async (node: TreeNode) => {
            if (!node || node.type !== 'skill') {
                vscode.window.showErrorMessage('No skill selected');
                return;
            }

            const skill = node.skill;
            const localPath = skill.localPath || skill.id;

            const wsFolder = vscode.workspace.workspaceFolders?.[0];
            if (!wsFolder) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }

            const fileUri = vscode.Uri.joinPath(wsFolder.uri, '.github', 'skills', localPath, 'SKILL.md');
            try {
                await vscode.workspace.fs.stat(fileUri);
                const document = await vscode.workspace.openTextDocument(fileUri);
                await vscode.window.showTextDocument(document, { preview: true });
            } catch {
                vscode.window.showWarningMessage(`Skill file not found: .github/skills/${localPath}/SKILL.md — try refreshing.`);
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
