import * as vscode from 'vscode';
import { Skill, TreeNode } from '../models/skill';
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
        vscode.commands.executeCommand('setContext', 'fdcSkills.isLoading', true);

        const sourceLabel = this.getSourceLabel();
        if (this.treeView) {
            this.treeView.message = `${sourceLabel} 에서 스킬을 불러오는 중...`;
        }
        this._onDidChangeTreeData.fire();

        try {
            await vscode.window.withProgress(
                { location: { viewId: 'fdcSkillsView' } },
                async () => {
                    if (!this.githubService.isConfigured()) {
                        this.tree = [];
                        this.skills = [];
                        vscode.window.showErrorMessage(
                            'GitHub Enterprise not configured. Set repoUrl and pat in Settings (fdcSkills.github) or .env file.'
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
            vscode.commands.executeCommand('setContext', 'fdcSkills.isLoading', false);
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
                command: 'fdcSkills.openFile',
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
            const skill = element.skill;
            const localPath = skill.localPath || skill.id;
            
            const wsFolder = vscode.workspace.workspaceFolders?.[0];
            if (!wsFolder) {
                return [];
            }

            const skillFolderUri = vscode.Uri.joinPath(wsFolder.uri, '.github', 'skills', localPath);
            
            try {
                const entries = await vscode.workspace.fs.readDirectory(skillFolderUri);
                const children: TreeNode[] = [];

                for (const [name, type] of entries) {
                    if (name === 'SKILL.md') {
                        // Skip SKILL.md as a separate node; we'll handle it specially if needed
                        continue;
                    }

                    if (type === vscode.FileType.Directory) {
                        const folderUri = vscode.Uri.joinPath(skillFolderUri, name);
                        const folderChildren = await this.getFilesRecursively(folderUri);
                        children.push({
                            type: 'folder',
                            name: name,
                            path: `${localPath}/${name}`,
                            children: folderChildren,
                        });
                    } else if (type === vscode.FileType.File) {
                        children.push({
                            type: 'file',
                            name: name,
                            path: vscode.Uri.joinPath(skillFolderUri, name),
                        } as any);
                    }
                }

                return children;
            } catch (error) {
                console.error(`Failed to read skill folder: ${error}`);
                return [];
            }
        }
        return [];
    }

    private async getFilesRecursively(folderUri: vscode.Uri): Promise<TreeNode[]> {
        const children: TreeNode[] = [];
        try {
            const entries = await vscode.workspace.fs.readDirectory(folderUri);
            for (const [name, type] of entries) {
                if (type === vscode.FileType.Directory) {
                    const subFolderUri = vscode.Uri.joinPath(folderUri, name);
                    const folderChildren = await this.getFilesRecursively(subFolderUri);
                    children.push({
                        type: 'folder',
                        name: name,
                        path: folderUri.path,
                        children: folderChildren,
                    });
                } else {
                    const fileUri = vscode.Uri.joinPath(folderUri, name);
                    children.push({
                        type: 'file',
                        name: name,
                        path: fileUri,
                    } as any);
                }
            }
        } catch (error) {
            console.error(`Failed to read folder: ${error}`);
        }
        return children;
    }

    getParent(_element: TreeNode): vscode.ProviderResult<TreeNode> {
        return undefined;
    }

    public getSkills(): Skill[] {
        return this.skills;
    }

    public findSkillById(id: string): Skill | undefined {
        return this.skills.find(s => s.id === id);
    }

    private getSourceLabel(): string {
        const config = vscode.workspace.getConfiguration('fdcSkills.github');
        const repoUrl = config.get<string>('repoUrl', '');
        const branch = config.get<string>('branch', 'main');

        if (repoUrl) {
            const match = repoUrl.match(/\/([^/]+)\/([^/]+?)(\.git)?$/);
            if (match) {
                return `${match[1]}/${match[2]} (${branch})`;
            }
        }
        return 'GitHub Enterprise';
    }
}
