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
                    vscode.window.showErrorMessage('파일을 열 수 없습니다. 동기화가 완료된 후 다시 시도해주세요.');
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
                title: '저장소 설정 (1/3)',
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
                title: '저장소 설정 (2/3)',
                prompt: 'Personal Access Token (PAT)을 입력하세요',
                placeHolder: '비공개 저장소인 경우 입력 (공개 저장소는 비워두세요)',
                password: true,
                ignoreFocusOut: true,
            });

            if (pat === undefined) {
                return; // User cancelled
            }

            // Step 3: Remove stale skills option
            const staleAnswer = await vscode.window.showWarningMessage(
                '소스 저장소에 없는 스킬을 로컬에서 자동 삭제할까요?\n\n⚠️ 활성화하면 소스 저장소에서 삭제된 스킬이 로컬 동기화 경로에서도 제거됩니다.',
                { modal: true },
                '삭제 활성화',
                '비활성화 (안전)'
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
            await vscode.workspace.getConfiguration('skillInventory.sync').update(
                'removeStaleSkills',
                staleAnswer === '삭제 활성화',
                vscode.ConfigurationTarget.Global
            );

            vscode.window.showInformationMessage('저장소 설정이 완료되었습니다.');
            await vscode.commands.executeCommand('skillInventory.refresh');
        })
    );

}
