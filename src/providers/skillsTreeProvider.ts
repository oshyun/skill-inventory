import * as vscode from 'vscode';
import * as os from 'os';
import { Skill, TreeNode, FolderNode } from '../models/skill';
import { GitHubService } from '../services/githubService';
import { CopilotService } from '../services/copilotService';

/**
 * Tree data provider that mirrors the GitHub repository folder structure.
 */
export class SkillsTreeProvider implements vscode.TreeDataProvider<TreeNode> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private tree: TreeNode[] = [];
    private skills: Skill[] = [];
    private isLoading = false;
    private treeView: vscode.TreeView<TreeNode> | undefined;

    constructor(private githubService: GitHubService) {}

    setTreeView(treeView: vscode.TreeView<TreeNode>): void {
        this.treeView = treeView;
    }

    public async refresh(): Promise<void> {
        if (this.isLoading) {
            return;
        }

        this.isLoading = true;
        vscode.commands.executeCommand('setContext', 'skillShelf.isLoading', true);

        const sourceLabel = this.getSourceLabel();
        const syncConfig = vscode.workspace.getConfiguration('skillShelf.sync');
        const syncEnabled = syncConfig.get<boolean>('enabled', true);
        const interval = syncConfig.get<number>('intervalSeconds', 30);
        const syncNote = syncEnabled
            ? `\n이 버튼을 누르지 않아도 ${interval}초마다 자동 동기화됩니다.`
            : '\n자동 동기화가 꺼져 있습니다. 설정에서 켤 수 있습니다.';
        if (this.treeView) {
            this.treeView.message = `${sourceLabel} 에서 스킬을 불러오는 중...${syncNote}`;
        }
        this._onDidChangeTreeData.fire();

        try {
            await vscode.window.withProgress(
                { location: { viewId: 'skillShelfView' } },
                async () => {
                    if (!this.githubService.isConfigured()) {
                        this.tree = [];
                        this.skills = [];
                        vscode.window.showErrorMessage(
                            'GitHub 저장소가 설정되지 않았습니다. 저장소 URL을 설정해주세요.'
                        );
                    } else {
                        const result = await this.githubService.fetchTree();
                        this.tree = result.tree;
                        this.skills = result.skills;
                    }
                }
            );
        } catch (error) {
            console.error('Error fetching skills:', error);
            vscode.window.showErrorMessage(`Failed to fetch skills: ${error instanceof Error ? error.message : 'Unknown error'}`);
            this.tree = [];
            this.skills = [];
        } finally {
            this.isLoading = false;
            vscode.commands.executeCommand('setContext', 'skillShelf.isLoading', false);
            if (this.treeView) {
                this.treeView.message = undefined;
            }
            this._onDidChangeTreeData.fire();

            if (this.skills.length > 0 && CopilotService.isAutoSyncEnabled()) {
                try {
                    await CopilotService.syncSkills(this.skills);
                } catch (error) {
                    console.error('Copilot prompt sync failed:', error);
                }
            }
        }
    }

    getTreeItem(element: TreeNode): vscode.TreeItem {
        if (element.type === 'folder') {
            const item = new vscode.TreeItem(element.name, vscode.TreeItemCollapsibleState.Expanded);
            item.iconPath = new vscode.ThemeIcon('folder');
            item.contextValue = 'folder';
            return item;
        }

        if (element.type === 'skill') {
            const skill = element.skill;
            const item = new vscode.TreeItem(skill.name, vscode.TreeItemCollapsibleState.Collapsed);
            item.tooltip = skill.description || skill.name;
            item.description = skill.tags?.join(', ') || '';
            item.iconPath = new vscode.ThemeIcon('symbol-method');
            item.contextValue = 'skill';
            return item;
        }

        if (element.type === 'file') {
            const file = element as any;
            const item = new vscode.TreeItem(file.name, vscode.TreeItemCollapsibleState.None);
            item.tooltip = file.path;
            item.iconPath = new vscode.ThemeIcon('file');
            item.contextValue = 'file';
            item.command = {
                command: 'skillShelf.openFile',
                title: 'Open File',
                arguments: [file],
            };
            return item;
        }

        return new vscode.TreeItem('Unknown');
    }

    async getChildren(element?: TreeNode): Promise<TreeNode[]> {
        if (!element) {
            return this.tree;
        }
        if (element.type === 'folder') {
            return element.children;
        }
        if (element.type === 'skill') {
            return this.buildSkillChildren(element.skill);
        }
        return [];
    }

    /**
     * Build child nodes from in-memory repo data (skill.files).
     * Shows SKILL.md first, then additional files organized by folder structure.
     */
    private buildSkillChildren(skill: Skill): TreeNode[] {
        const children: TreeNode[] = [];

        // SKILL.md first
        children.push({
            type: 'file',
            name: 'SKILL.md',
            path: this.resolveSkillFileUri(skill, 'SKILL.md'),
        });

        const files = skill.files || [];
        if (files.length === 0) {
            return children;
        }

        // Build nested folder structure from flat file list
        const folderNodes = new Map<string, FolderNode>();

        for (const file of files) {
            const parts = file.relativePath.split('/');
            if (parts.length === 1) {
                children.push({
                    type: 'file',
                    name: file.relativePath,
                    path: this.resolveSkillFileUri(skill, file.relativePath),
                });
            } else {
                // Walk through path segments, creating intermediate folders
                let currentChildren = children;
                for (let i = 0; i < parts.length - 1; i++) {
                    const folderKey = parts.slice(0, i + 1).join('/');
                    let folder = folderNodes.get(folderKey);
                    if (!folder) {
                        folder = {
                            type: 'folder',
                            name: parts[i],
                            path: folderKey,
                            children: [],
                        };
                        folderNodes.set(folderKey, folder);
                        currentChildren.push(folder);
                    }
                    currentChildren = folder.children;
                }
                currentChildren.push({
                    type: 'file',
                    name: parts[parts.length - 1],
                    path: this.resolveSkillFileUri(skill, file.relativePath),
                });
            }
        }

        return children;
    }

    /**
     * Resolve a skill file's relative path to a local URI using the first sync target.
     */
    private resolveSkillFileUri(skill: Skill, relativePath: string): vscode.Uri {
        const syncTargets = CopilotService.getSyncTargets();
        const basePath = syncTargets[0] || '.github/skills';
        const localPath = skill.localPath || skill.id;

        if (basePath.startsWith('~/') || basePath === '~') {
            const resolved = basePath.replace(/^~/, os.homedir());
            return vscode.Uri.file(`${resolved}/${localPath}/${relativePath}`);
        }

        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        if (!wsFolder) {
            return vscode.Uri.parse('');
        }
        return vscode.Uri.joinPath(wsFolder.uri, basePath, localPath, relativePath);
    }

    getParent(_element: TreeNode): vscode.ProviderResult<TreeNode> {
        return undefined;
    }

    public getSkills(): Skill[] {
        return this.skills;
    }

    private getSourceLabel(): string {
        const config = vscode.workspace.getConfiguration('skillShelf.github');
        const repoUrl = config.get<string>('repoUrl', '');
        const branch = config.get<string>('branch', 'main');

        if (repoUrl) {
            const match = repoUrl.match(/\/([^/]+)\/([^/]+?)(\.git)?$/);
            if (match) {
                return `${match[1]}/${match[2]} (${branch})`;
            }
        }
        return 'GitHub';
    }
}
