import * as vscode from 'vscode';
import * as os from 'os';
import { Skill, TreeNode, FolderNode } from '../models/skill';
import { GitHubService } from '../services/githubService';
import { CopilotService } from '../services/copilotService';
import { getErrorMessage, showMessageWithAction } from '../utils';

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
    private keepLocalSkillsCache: string[] = [];
    private loadingSkillIds = new Set<string>();

    constructor(private githubService: GitHubService) {}

    setTreeView(treeView: vscode.TreeView<TreeNode>): void {
        this.treeView = treeView;
        treeView.message = this.getSourceLabel() || undefined;
    }

    public async refresh(forceSync = false): Promise<void> {
        if (this.isLoading) {
            return;
        }

        this.isLoading = true;
        vscode.commands.executeCommand('setContext', 'skillInventory.isLoading', true);

        this._onDidChangeTreeData.fire();

        try {
            await vscode.window.withProgress(
                { location: { viewId: 'skillInventoryView' } },
                async () => {
                    if (!this.githubService.isConfigured()) {
                        this.tree = [];
                        this.skills = [];
                        showMessageWithAction(
                            'error',
                            'No repository configured. Please set a repository URL.',
                            'Setup Repository',
                            'skillInventory.setupRepository'
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
            const message = getErrorMessage(error);
            const isAuthError = message.toLowerCase().includes('authenticate') || message.includes('401');
            if (isAuthError) {
                showMessageWithAction(
                    'error',
                    'GitHub authentication failed. Your Personal Access Token (PAT) may be invalid or expired.',
                    'Change Personal Access Token (PAT)',
                    'skillInventory.changePat'
                );
            } else {
                vscode.window.showErrorMessage(`Failed to fetch skills: ${message}`);
            }
            this.tree = [];
            this.skills = [];
        } finally {
            this.isLoading = false;
            vscode.commands.executeCommand('setContext', 'skillInventory.isLoading', false);
            if (this.treeView) {
                this.treeView.message = this.getSourceLabel() || undefined;
            }
            this.keepLocalSkillsCache = CopilotService.getKeepLocalSkills();
            this._onDidChangeTreeData.fire();
        }

        // Phase 2: fetch additional files in background, then sync
        if (this.skills.length > 0) {
            this.fetchFilesAndSync(forceSync).catch(err =>
                console.error('Background file fetch failed:', err)
            );
        }
    }

    private async fetchFilesAndSync(forceSync: boolean): Promise<void> {
        for (const skill of this.skills) {
            this.loadingSkillIds.add(skill.id);
        }
        this._onDidChangeTreeData.fire();

        try {
            await Promise.all(
                this.skills.map(async (skill) => {
                    if (skill.folderPath) {
                        skill.files = await this.githubService.collectSkillFiles(skill.folderPath);
                    }
                    this.loadingSkillIds.delete(skill.id);
                    this._onDidChangeTreeData.fire();
                })
            );
        } catch (error) {
            this.loadingSkillIds.clear();
            this._onDidChangeTreeData.fire();
            console.error('Failed to fetch skill files:', error);
        }

        if (CopilotService.isAutoSyncEnabled() || forceSync) {
            try {
                await CopilotService.syncSkills(this.skills);
            } catch (error) {
                console.error('Copilot prompt sync failed:', error);
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
            const isLoadingFiles = this.loadingSkillIds.has(skill.id);
            const ignored = this.keepLocalSkillsCache.includes(skill.localPath || skill.id);
            const item = new vscode.TreeItem(skill.name, vscode.TreeItemCollapsibleState.Collapsed);
            item.tooltip = skill.description || skill.name;
            item.description = ignored ? '(ignored)' : (skill.tags?.join(', ') || '');
            item.iconPath = new vscode.ThemeIcon(
                isLoadingFiles ? 'loading~spin' : (ignored ? 'lock' : 'symbol-method')
            );
            item.contextValue = ignored ? 'skill-ignored' : 'skill';
            return item;
        }

        if (element.type === 'file') {
            const file = element as any;
            const item = new vscode.TreeItem(file.name, vscode.TreeItemCollapsibleState.None);
            item.tooltip = file.path;
            item.iconPath = new vscode.ThemeIcon('file');
            item.contextValue = 'file';
            item.command = {
                command: 'skillInventory.openFile',
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
            content: skill.rawContent || skill.content,
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
                    content: file.content,
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
                    content: file.content,
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

    /** Refresh only the tree UI without re-fetching from remote. */
    public refreshTree(): void {
        this.keepLocalSkillsCache = CopilotService.getKeepLocalSkills();
        this._onDidChangeTreeData.fire();
    }

    public getSkills(): Skill[] {
        return this.skills;
    }

    private getSourceLabel(): string {
        const config = vscode.workspace.getConfiguration('skillInventory.source');
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
