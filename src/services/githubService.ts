import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Octokit } from '@octokit/rest';
import { Skill, SkillFile, TreeNode, markdownToSkill } from '../models/skill';

export interface GitHubConfig {
    baseUrl: string;
    owner: string;
    repo: string;
    branch: string;
    skillsPath: string;
    pat: string;
}

export class GitHubService {
    private octokit: Octokit | null = null;
    private config: GitHubConfig | null = null;
    private extensionPath: string;

    constructor(extensionPath: string) {
        this.extensionPath = extensionPath;
        this.loadConfig();
    }

    /**
     * Parse .env file content
     */
    private parseEnvFile(content: string): Record<string, string> {
        const result: Record<string, string> = {};
        const lines = content.split('\n');
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const eqIndex = trimmed.indexOf('=');
                if (eqIndex > 0) {
                    const key = trimmed.substring(0, eqIndex).trim();
                    const value = trimmed.substring(eqIndex + 1).trim();
                    result[key] = value;
                }
            }
        }
        
        return result;
    }

    /**
     * Parse GitHub URL to extract owner and repo.
     * Supports both GitHub.com and GitHub Enterprise URLs.
     */
    private parseRepoUrl(url: string): { baseUrl: string; owner: string; repo: string } {
        const match = url.match(/^(https?:\/\/[^\/]+)\/([^\/]+)\/([^\/]+?)(\.git)?$/);

        if (match) {
            const host = match[1];
            const isGitHubCom = /^https?:\/\/(www\.)?github\.com$/i.test(host);
            return {
                baseUrl: isGitHubCom ? 'https://api.github.com' : `${host}/api/v3`,
                owner: match[2],
                repo: match[3],
            };
        }

        throw new Error(`Invalid repository URL: ${url}`);
    }

    /**
     * Parse PAT string (format: "user:token" or just "token")
     */
    private parsePat(pat: string): string {
        if (pat.includes(':')) {
            return pat.split(':')[1];
        }
        return pat;
    }

    /**
     * Load configuration from VS Code settings, falling back to .env file
     */
    private loadConfig(): void {
        try {
            // 1) Try VS Code settings first
            const vsConfig = vscode.workspace.getConfiguration('skillInventory.source');
            const settingsRepoUrl = vsConfig.get<string>('repoUrl', '');
            const settingsPat = vsConfig.get<string>('pat', '');

            if (settingsRepoUrl) {
                const { baseUrl, owner, repo } = this.parseRepoUrl(settingsRepoUrl);
                const token = settingsPat ? this.parsePat(settingsPat) : '';
                const branch = vsConfig.get<string>('branch', 'main');
                const skillsPathRaw = vsConfig.get<string>('skillsPath', 'skills');

                this.config = {
                    baseUrl,
                    owner,
                    repo,
                    branch,
                    skillsPath: skillsPathRaw === '/' ? '' : skillsPathRaw,
                    pat: token,
                };

                this.octokit = new Octokit({
                    auth: this.config.pat || undefined,
                    baseUrl: this.config.baseUrl,
                });

                console.log(`GitHub configured (settings): ${this.config.baseUrl}, ${this.config.owner}/${this.config.repo}`);
                return;
            }

            // 2) Fallback: .env file
            const possiblePaths = [
                path.join(this.extensionPath, '.env'),
                path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '', '.env'),
            ];

            let envContent = '';
            let foundPath = '';

            for (const envPath of possiblePaths) {
                if (fs.existsSync(envPath)) {
                    envContent = fs.readFileSync(envPath, 'utf-8');
                    foundPath = envPath;
                    break;
                }
            }

            if (!envContent) {
                console.log('No configuration found (settings empty, no .env file)');
                this.config = null;
                return;
            }

            console.log(`Loading config from .env: ${foundPath}`);
            const env = this.parseEnvFile(envContent);

            const repoUrl = env['repo_url'] || env['repo_rul'] || '';
            const pat = env['pat'] || '';

            if (!repoUrl || !pat) {
                console.error('.env file missing required fields (repo_url, pat)');
                this.config = null;
                return;
            }

            const { baseUrl, owner, repo } = this.parseRepoUrl(repoUrl);
            const token = this.parsePat(pat);

            this.config = {
                baseUrl,
                owner,
                repo,
                branch: env['branch'] || 'main',
                skillsPath: env['skills_path'] === '/' ? '' : (env['skills_path'] || 'skills'),
                pat: token,
            };

            this.octokit = new Octokit({
                auth: this.config.pat,
                baseUrl: this.config.baseUrl,
            });

            console.log(`GitHub configured (.env): ${this.config.baseUrl}, ${this.config.owner}/${this.config.repo}`);
        } catch (error) {
            console.error('Failed to load config:', error);
            this.config = null;
        }
    }

    /**
     * Check if the service is properly configured
     */
    public isConfigured(): boolean {
        return !!(this.config?.owner && this.config?.repo);
    }

    /**
     * Get current configuration
     */
    public getConfig(): GitHubConfig | null {
        return this.config;
    }

    /**
     * Refresh configuration from .env file
     */
    public refreshConfig(): void {
        this.loadConfig();
    }

    /**
     * Ensure the service is authenticated
     */
    private ensureAuthenticated(): Octokit {
        if (!this.octokit || !this.config) {
            throw new Error('No repository configured. Please set a repository URL.');
        }
        return this.octokit;
    }

    /**
     * Fetch skills as a tree structure mirroring the GitHub repository layout.
     * Directories with SKILL.md are skill nodes; others are folder nodes.
     */
    public async fetchTree(): Promise<{ tree: TreeNode[]; skills: Skill[] }> {
        if (!this.isConfigured()) {
            throw new Error('No repository configured. Please set a repository URL.');
        }

        const octokit = this.ensureAuthenticated();
        const allSkills: Skill[] = [];

        const sourceConfig = vscode.workspace.getConfiguration('skillInventory.source');
        const whitelist = sourceConfig.get<string[]>('skillWhitelist', []);
        const blacklist = sourceConfig.get<string[]>('skillBlacklist', []);

        const walk = async (dirPath: string, relativeBase: string): Promise<TreeNode[]> => {
            const response = await octokit.repos.getContent({
                owner: this.config!.owner,
                repo: this.config!.repo,
                path: dirPath,
                ref: this.config!.branch,
            });

            if (!Array.isArray(response.data)) {
                return [];
            }

            const nodes: TreeNode[] = [];

            for (const item of response.data) {
                if (item.type !== 'dir') {
                    continue;
                }

                const relativePath = relativeBase ? `${relativeBase}/${item.name}` : item.name;
                const skillMdPath = `${item.path}/SKILL.md`;

                try {
                    const fileContent = await octokit.repos.getContent({
                        owner: this.config!.owner,
                        repo: this.config!.repo,
                        path: skillMdPath,
                        ref: this.config!.branch,
                    });

                    if ('content' in fileContent.data && typeof fileContent.data.content === 'string') {
                        // Apply whitelist/blacklist filter
                        const passesWhitelist = whitelist.length === 0 || whitelist.includes(item.name);
                        const passesBlacklist = whitelist.length > 0 || !blacklist.includes(item.name);
                        if (!passesWhitelist || !passesBlacklist) {
                            continue;
                        }

                        const content = Buffer.from(fileContent.data.content, 'base64').toString('utf-8');
                        const skill = markdownToSkill(content, skillMdPath, fileContent.data.sha);
                        skill.rawContent = content;
                        if (!skill.id || skill.id.startsWith('skill-')) {
                            skill.id = item.name;
                        }
                        skill.folderPath = item.path;
                        skill.localPath = relativePath;
                        // Collect all other files in the skill folder
                        skill.files = await this.collectSkillFiles(item.path);
                        allSkills.push(skill);
                        nodes.push({ type: 'skill', skill });
                    }
                } catch {
                    // No SKILL.md — treat as a folder, recurse
                    const children = await walk(item.path, relativePath);
                    if (children.length > 0) {
                        nodes.push({ type: 'folder', name: item.name, path: item.path, children });
                    }
                }
            }

            return nodes;
        };

        try {
            const tree = await walk(this.config!.skillsPath, '');
            return { tree, skills: allSkills };
        } catch (error: unknown) {
            if (error instanceof Error && 'status' in error && (error as { status: number }).status === 404) {
                return { tree: [], skills: [] };
            }
            throw error;
        }
    }

    /**
     * Recursively collect all files in a skill folder (excluding SKILL.md).
     */
    private async collectSkillFiles(folderPath: string): Promise<SkillFile[]> {
        const octokit = this.ensureAuthenticated();
        const files: SkillFile[] = [];

        const walkDir = async (dirPath: string, relativeBase: string): Promise<void> => {
            let response;
            try {
                response = await octokit.repos.getContent({
                    owner: this.config!.owner,
                    repo: this.config!.repo,
                    path: dirPath,
                    ref: this.config!.branch,
                });
            } catch {
                return;
            }

            if (!Array.isArray(response.data)) {
                return;
            }

            for (const entry of response.data) {
                const relativePath = relativeBase ? `${relativeBase}/${entry.name}` : entry.name;

                if (entry.type === 'dir') {
                    await walkDir(entry.path, relativePath);
                } else if (entry.type === 'file' && entry.name !== 'SKILL.md') {
                    try {
                        const fileResp = await octokit.repos.getContent({
                            owner: this.config!.owner,
                            repo: this.config!.repo,
                            path: entry.path,
                            ref: this.config!.branch,
                        });
                        if ('content' in fileResp.data && typeof fileResp.data.content === 'string') {
                            const content = Buffer.from(fileResp.data.content, 'base64').toString('utf-8');
                            files.push({ relativePath, content, sha: fileResp.data.sha });
                        }
                    } catch {
                        // skip unreadable files
                    }
                }
            }
        };

        await walkDir(folderPath, '');
        return files;
    }

    /**
     * Get the SHA of the latest commit that touched the skills path.
     * Returns undefined if not configured or on error.
     */
    public async getLatestCommitSha(): Promise<string | undefined> {
        if (!this.isConfigured()) {
            return undefined;
        }

        try {
            const octokit = this.ensureAuthenticated();
            const { data } = await octokit.repos.listCommits({
                owner: this.config!.owner,
                repo: this.config!.repo,
                sha: this.config!.branch,
                path: this.config!.skillsPath || undefined,
                per_page: 1,
            });
            return data[0]?.sha;
        } catch {
            return undefined;
        }
    }

}
