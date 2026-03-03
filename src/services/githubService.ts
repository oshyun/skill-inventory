import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Octokit } from '@octokit/rest';
import { Skill, SkillFile, TreeNode, markdownToSkill } from '../models/skill';
import { PAT_SECRET_KEY } from '../utils';

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
    private secrets: vscode.SecretStorage;
    private configFromSettings = false;

    constructor(extensionPath: string, secrets: vscode.SecretStorage) {
        this.extensionPath = extensionPath;
        this.secrets = secrets;
        this.loadConfigSync();
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
     * Load configuration synchronously from VS Code settings or .env file.
     * PAT is NOT loaded here for the settings case — call refreshConfig() to load it from SecretStorage.
     */
    private loadConfigSync(): void {
        try {
            // 1) Try VS Code settings first (PAT excluded — loaded via SecretStorage in refreshConfig)
            const vsConfig = vscode.workspace.getConfiguration('skillInventory.source');
            const settingsRepoUrl = vsConfig.get<string>('repoUrl', '');

            if (settingsRepoUrl) {
                const { baseUrl, owner, repo } = this.parseRepoUrl(settingsRepoUrl);
                const branch = vsConfig.get<string>('branch', 'main') || 'master';
                const skillsPathRaw = vsConfig.get<string>('skillsPath', '/skills');

                this.config = {
                    baseUrl,
                    owner,
                    repo,
                    branch,
                    skillsPath: skillsPathRaw.replace(/^\//, ''),
                    pat: '',
                };
                this.configFromSettings = true;

                // Octokit created without auth; will be recreated with PAT after refreshConfig()
                this.octokit = new Octokit({
                    baseUrl: this.config.baseUrl,
                });

                console.log(`GitHub configured (settings): ${this.config.baseUrl}, ${this.config.owner}/${this.config.repo}`);
                return;
            }

            // 2) Fallback: .env file (PAT stored in file, not SecretStorage)
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
                this.configFromSettings = false;
                return;
            }

            console.log(`Loading config from .env: ${foundPath}`);
            const env = this.parseEnvFile(envContent);

            const repoUrl = env['repo_url'] || env['repo_rul'] || '';
            const pat = env['pat'] || '';

            if (!repoUrl || !pat) {
                console.error('.env file missing required fields (repo_url, pat)');
                this.config = null;
                this.configFromSettings = false;
                return;
            }

            const { baseUrl, owner, repo } = this.parseRepoUrl(repoUrl);
            const token = this.parsePat(pat);

            this.config = {
                baseUrl,
                owner,
                repo,
                branch: env['branch'] || 'master',
                skillsPath: (env['skills_path'] || '/skills').replace(/^\//, ''),
                pat: token,
            };
            this.configFromSettings = false;

            this.octokit = new Octokit({
                auth: this.config.pat,
                baseUrl: this.config.baseUrl,
            });

            console.log(`GitHub configured (.env): ${this.config.baseUrl}, ${this.config.owner}/${this.config.repo}`);
        } catch (error) {
            console.error('Failed to load config:', error);
            this.config = null;
            this.configFromSettings = false;
        }
    }

    /**
     * For settings-based config, load PAT from SecretStorage (with migration from old settings.pat).
     * Must be called after loadConfigSync() to fully initialize the service.
     */
    private async loadPatFromSecrets(): Promise<void> {
        if (!this.config || !this.configFromSettings) {
            return;
        }

        let pat = await this.secrets.get(PAT_SECRET_KEY);

        if (!pat) {
            // One-time migration: if PAT exists in old settings.json, move it to SecretStorage
            const vsConfig = vscode.workspace.getConfiguration('skillInventory.source');
            const legacyPat = vsConfig.get<string>('pat', '');
            if (legacyPat) {
                await this.secrets.store(PAT_SECRET_KEY, legacyPat);
                await vsConfig.update('pat', undefined, vscode.ConfigurationTarget.Global);
                pat = legacyPat;
                console.log('Migrated PAT from settings to SecretStorage');
            }
        }

        this.config.pat = pat ? this.parsePat(pat) : '';
        this.octokit = new Octokit({
            auth: this.config.pat || undefined,
            baseUrl: this.config.baseUrl,
        });
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
     * Reload configuration and PAT from SecretStorage.
     */
    public async refreshConfig(): Promise<void> {
        this.loadConfigSync();
        await this.loadPatFromSecrets();
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
     * Sibling directories are fetched in parallel.
     */
    public async fetchTree(): Promise<{ tree: TreeNode[]; skills: Skill[] }> {
        if (!this.isConfigured()) {
            throw new Error('No repository configured. Please set a repository URL.');
        }

        const octokit = this.ensureAuthenticated();
        const allSkills: Skill[] = [];

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

            const dirs = response.data.filter(item => item.type === 'dir');

            const nodeResults = await Promise.all(dirs.map(async (item): Promise<TreeNode | null> => {
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
                        const content = Buffer.from(fileContent.data.content, 'base64').toString('utf-8');
                        const skill = markdownToSkill(content, skillMdPath, fileContent.data.sha);
                        skill.rawContent = content;
                        if (!skill.id || skill.id.startsWith('skill-')) {
                            skill.id = item.name;
                        }
                        skill.folderPath = item.path;
                        skill.localPath = relativePath;
                        allSkills.push(skill);
                        return { type: 'skill' as const, skill };
                    }
                    return null;
                } catch {
                    // No SKILL.md — treat as a folder, recurse
                    const children = await walk(item.path, relativePath);
                    if (children.length > 0) {
                        return { type: 'folder' as const, name: item.name, path: item.path, children };
                    }
                    return null;
                }
            }));

            return nodeResults.filter((n): n is TreeNode => n !== null);
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
     * Files within each directory are fetched in parallel.
     */
    public async collectSkillFiles(folderPath: string): Promise<SkillFile[]> {
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

            await Promise.all(response.data.map(async (entry) => {
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
            }));
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
