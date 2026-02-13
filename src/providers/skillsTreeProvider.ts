import * as vscode from 'vscode';
import { Skill } from '../models/skill';
import { GitHubService } from '../services/githubService';
import { CopilotService } from '../services/copilotService';

/**
 * Tree item representing a skill in the tree view
 */
export class SkillTreeItem extends vscode.TreeItem {
    constructor(
        public readonly skill: Skill,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
    ) {
        super(skill.name, collapsibleState);
        
        this.tooltip = skill.description || skill.name;
        this.description = skill.tags?.join(', ') || '';
        this.contextValue = 'skill';
        
        // Set icon
        this.iconPath = new vscode.ThemeIcon('symbol-method');
        
        // Set command to view skill on click
        this.command = {
            command: 'fdcSkills.viewSkill',
            title: 'View Skill',
            arguments: [this],
        };
    }
}

/**
 * Tree data provider for Claude skills
 */
export class SkillsTreeProvider implements vscode.TreeDataProvider<SkillTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<SkillTreeItem | undefined | null | void> = new vscode.EventEmitter<SkillTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<SkillTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private skills: Skill[] = [];
    private isLoading: boolean = false;

    constructor(private githubService: GitHubService) {}

    /**
     * Refresh the tree view data
     */
    public async refresh(): Promise<void> {
        if (this.isLoading) {
            return;
        }

        this.isLoading = true;
        
        try {
            if (!this.githubService.isConfigured()) {
                this.skills = [];
                vscode.window.showErrorMessage(
                    'GitHub Enterprise not configured. Set repoUrl and pat in Settings (fdcSkills.github) or .env file.'
                );
            } else {
                this.skills = await this.githubService.fetchSkills();
            }
        } catch (error) {
            console.error('Error fetching skills:', error);
            vscode.window.showErrorMessage(`Failed to fetch skills: ${error instanceof Error ? error.message : 'Unknown error'}`);
            this.skills = [];
        } finally {
            this.isLoading = false;
            this._onDidChangeTreeData.fire();

            // Sync to Copilot prompts (non-blocking, failures don't affect tree view)
            if (this.skills.length > 0 && CopilotService.isAutoSyncEnabled()) {
                try {
                    await CopilotService.syncSkills(this.skills);
                } catch (error) {
                    console.error('Copilot prompt sync failed:', error);
                }
            }
        }
    }

    /**
     * Get tree item for display
     */
    getTreeItem(element: SkillTreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * Get children elements
     */
    getChildren(element?: SkillTreeItem): Thenable<SkillTreeItem[]> {
        if (element) {
            // No nested children for now
            return Promise.resolve([]);
        }

        // Root level - return all skills
        const items = this.skills.map(skill => new SkillTreeItem(skill));
        return Promise.resolve(items);
    }

    /**
     * Get parent element
     */
    getParent(_element: SkillTreeItem): vscode.ProviderResult<SkillTreeItem> {
        return null;
    }

    /**
     * Get all skills
     */
    public getSkills(): Skill[] {
        return this.skills;
    }

    /**
     * Find a skill by ID
     */
    public findSkillById(id: string): Skill | undefined {
        return this.skills.find(s => s.id === id);
    }
}
