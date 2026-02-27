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
        vscode.commands.registerCommand('skillShelf.refresh', async () => {
            await skillsTreeProvider.refresh();
        })
    );

    // View skill command — expand skill folder to show contents
    context.subscriptions.push(
        vscode.commands.registerCommand('skillShelf.viewSkill', async (node: TreeNode) => {
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
        vscode.commands.registerCommand('skillShelf.openFile', async (file: any) => {
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

    // Configure repository command — open VS Code settings filtered to skillShelf
    context.subscriptions.push(
        vscode.commands.registerCommand('skillShelf.configure', () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'skillShelf');
        })
    );

    // Setup repository command — guided InputBox workflow
    context.subscriptions.push(
        vscode.commands.registerCommand('skillShelf.setupRepository', async () => {
            // Step 1: Repository URL (required)
            const repoUrl = await vscode.window.showInputBox({
                title: '저장소 설정 (1/2)',
                prompt: 'GitHub 저장소 URL을 입력하세요',
                placeHolder: 'https://github.com/org/repo',
                ignoreFocusOut: true,
                validateInput: (value) => {
                    if (!value.trim()) {
                        return '저장소 URL은 필수입니다.';
                    }
                    if (!/^https?:\/\/[^/]+\/[^/]+\/[^/]+/.test(value.trim())) {
                        return '올바른 GitHub 저장소 URL을 입력해주세요. (예: https://github.com/org/repo)';
                    }
                    return undefined;
                },
            });

            if (repoUrl === undefined) {
                return; // User cancelled
            }

            // Step 2: PAT (optional)
            const pat = await vscode.window.showInputBox({
                title: '저장소 설정 (2/2)',
                prompt: 'Personal Access Token (PAT)을 입력하세요',
                placeHolder: '비공개 저장소인 경우 입력 (공개 저장소는 비워두세요)',
                password: true,
                ignoreFocusOut: true,
            });

            if (pat === undefined) {
                return; // User cancelled
            }

            // Save to global settings
            const config = vscode.workspace.getConfiguration('skillShelf.github');
            await config.update('repoUrl', repoUrl.trim(), vscode.ConfigurationTarget.Global);
            if (pat) {
                await config.update('pat', pat.trim(), vscode.ConfigurationTarget.Global);
            }

            vscode.window.showInformationMessage('저장소 설정이 완료되었습니다.');
            await vscode.commands.executeCommand('skillShelf.refresh');
        })
    );

}
