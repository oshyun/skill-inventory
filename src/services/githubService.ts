import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Octokit } from '@octokit/rest';
import { Skill, markdownToSkill, skillToMarkdown } from '../models/skill';

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
     * Parse GitHub URL to extract owner and repo
     */
    private parseRepoUrl(url: string): { baseUrl: string; owner: string; repo: string } {
        // Handle URLs like: https://oss.fin.navercorp.com/fintelligence/skill-hub.git
        const match = url.match(/^(https?:\/\/[^\/]+)\/([^\/]+)\/([^\/]+?)(\.git)?$/);
        
        if (match) {
            return {
                baseUrl: `${match[1]}/api/v3`,
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
            const vsConfig = vscode.workspace.getConfiguration('fdcSkills.github');
            const settingsRepoUrl = vsConfig.get<string>('repoUrl', '');
            const settingsPat = vsConfig.get<string>('pat', '');

            if (settingsRepoUrl && settingsPat) {
                const { baseUrl, owner, repo } = this.parseRepoUrl(settingsRepoUrl);
                const token = this.parsePat(settingsPat);
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
                    auth: this.config.pat,
                    baseUrl: this.config.baseUrl,
                });

                console.log(`GitHub Enterprise configured (settings): ${this.config.baseUrl}, ${this.config.owner}/${this.config.repo}`);
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

            console.log(`GitHub Enterprise configured (.env): ${this.config.baseUrl}, ${this.config.owner}/${this.config.repo}`);
        } catch (error) {
            console.error('Failed to load config:', error);
            this.config = null;
        }
    }

    /**
     * Check if the service is properly configured
     */
    public isConfigured(): boolean {
        return !!(this.config?.owner && this.config?.repo && this.config?.pat);
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
            throw new Error('GitHub Enterprise not configured. Set repoUrl and pat in Settings or .env file.');
        }
        return this.octokit;
    }

    /**
     * Fetch all skills from the GitHub repository
     * Skills are folders under skillsPath, each containing a SKILL.md file
     */
    public async fetchSkills(): Promise<Skill[]> {
        if (!this.isConfigured()) {
            throw new Error('GitHub Enterprise not configured. Set repoUrl and pat in Settings or .env file.');
        }

        const octokit = this.ensureAuthenticated();
        const skills: Skill[] = [];

        try {
            // Get list of folders under skills path
            const response = await octokit.repos.getContent({
                owner: this.config!.owner,
                repo: this.config!.repo,
                path: this.config!.skillsPath,
                ref: this.config!.branch,
            });

            if (Array.isArray(response.data)) {
                for (const item of response.data) {
                    // Each skill is a folder (directory)
                    if (item.type === 'dir') {
                        const skillFolderName = item.name;
                        const skillMdPath = `${item.path}/SKILL.md`;

                        try {
                            // Fetch SKILL.md from the folder
                            const fileContent = await octokit.repos.getContent({
                                owner: this.config!.owner,
                                repo: this.config!.repo,
                                path: skillMdPath,
                                ref: this.config!.branch,
                            });

                            if ('content' in fileContent.data && typeof fileContent.data.content === 'string') {
                                const content = Buffer.from(fileContent.data.content, 'base64').toString('utf-8');
                                const skill = markdownToSkill(content, skillMdPath, fileContent.data.sha);
                                // Use folder name as skill ID if not defined
                                if (!skill.id || skill.id.startsWith('skill-')) {
                                    skill.id = skillFolderName;
                                }
                                // Store folder path for later operations
                                skill.folderPath = item.path;
                                skills.push(skill);
                            }
                        } catch (err) {
                            // SKILL.md doesn't exist in this folder, skip it
                            console.log(`No SKILL.md found in ${item.path}`);
                        }
                    }
                }
            }
        } catch (error: unknown) {
            if (error instanceof Error && 'status' in error && (error as { status: number }).status === 404) {
                // Skills directory doesn't exist yet, return empty array
                return [];
            }
            throw error;
        }

        return skills;
    }

    /**
     * Create a new skill in the repository
     * Creates a folder with SKILL.md inside
     */
    public async createSkill(skill: Skill): Promise<Skill> {
        if (!this.isConfigured()) {
            throw new Error('GitHub Enterprise not configured');
        }

        const octokit = this.ensureAuthenticated();
        // Create folder name from skill name (kebab-case)
        const folderName = skill.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const folderPath = `${this.config!.skillsPath}/${folderName}`;
        const filePath = `${folderPath}/SKILL.md`;
        const content = skillToMarkdown(skill);

        const response = await octokit.repos.createOrUpdateFileContents({
            owner: this.config!.owner,
            repo: this.config!.repo,
            path: filePath,
            message: `Add skill: ${skill.name}`,
            content: Buffer.from(content).toString('base64'),
            branch: this.config!.branch,
        });

        skill.id = folderName;
        skill.folderPath = folderPath;
        skill.filePath = filePath;
        skill.sha = response.data.content?.sha;

        return skill;
    }

    /**
     * Update an existing skill in the repository
     */
    public async updateSkill(skill: Skill): Promise<Skill> {
        if (!this.isConfigured()) {
            throw new Error('GitHub Enterprise not configured');
        }

        if (!skill.filePath || !skill.sha) {
            throw new Error('Skill must have filePath and sha for update');
        }

        const octokit = this.ensureAuthenticated();
        skill.updatedAt = new Date().toISOString();
        const content = skillToMarkdown(skill);

        const response = await octokit.repos.createOrUpdateFileContents({
            owner: this.config!.owner,
            repo: this.config!.repo,
            path: skill.filePath,
            message: `Update skill: ${skill.name}`,
            content: Buffer.from(content).toString('base64'),
            sha: skill.sha,
            branch: this.config!.branch,
        });

        skill.sha = response.data.content?.sha;

        return skill;
    }

    /**
     * Delete a skill from the repository
     */
    public async deleteSkill(skill: Skill): Promise<void> {
        if (!this.isConfigured()) {
            throw new Error('GitHub Enterprise not configured');
        }

        if (!skill.filePath || !skill.sha) {
            throw new Error('Skill must have filePath and sha for deletion');
        }

        const octokit = this.ensureAuthenticated();

        await octokit.repos.deleteFile({
            owner: this.config!.owner,
            repo: this.config!.repo,
            path: skill.filePath,
            message: `Delete skill: ${skill.name}`,
            sha: skill.sha,
            branch: this.config!.branch,
        });
    }

    /**
     * Check repository connection
     */
    public async testConnection(): Promise<boolean> {
        if (!this.isConfigured()) {
            return false;
        }

        try {
            const octokit = this.ensureAuthenticated();
            await octokit.repos.get({
                owner: this.config!.owner,
                repo: this.config!.repo,
            });
            return true;
        } catch (error) {
            console.error('Connection test failed:', error);
            return false;
        }
    }
}
