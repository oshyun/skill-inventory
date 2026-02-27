import * as vscode from 'vscode';

/**
 * Tree node types for hierarchical tree view
 */
export type TreeNode = FolderNode | SkillNode | FileNode;

export interface FolderNode {
    type: 'folder';
    name: string;
    path: string;
    children: TreeNode[];
}

export interface SkillNode {
    type: 'skill';
    skill: Skill;
}

export interface FileNode {
    type: 'file';
    name: string;
    path: vscode.Uri;
}

/**
 * A file inside a skill folder (excluding SKILL.md itself)
 */
export interface SkillFile {
    /** Path relative to the skill folder (e.g. "references/workflows.md") */
    relativePath: string;
    /** File content (text files only; binary files are skipped) */
    content: string;
    /** GitHub SHA */
    sha?: string;
}

/**
 * Skill data model representing a skill
 */
export interface Skill {
    /** Unique identifier for the skill (folder name) */
    id: string;
    /** Display name of the skill */
    name: string;
    /** Detailed description of what the skill does */
    description: string;
    /** The skill content/prompt template */
    content: string;
    /** Category or tags for organization */
    tags?: string[];
    /** File path to SKILL.md in the GitHub repository */
    filePath?: string;
    /** Folder path in the GitHub repository */
    folderPath?: string;
    /** Path relative to skills root for local .github/skills/ layout */
    localPath?: string;
    /** Original raw file content from GitHub (including frontmatter) */
    rawContent?: string;
    /** Additional files in the skill folder (path relative to skill folder → content) */
    files?: SkillFile[];
    /** SHA hash for GitHub file versioning */
    sha?: string;
    /** Creation timestamp */
    createdAt?: string;
    /** Last update timestamp */
    updatedAt?: string;
}

/**
 * Create a new Skill object with default values
 */
export function createSkill(partial: Partial<Skill>): Skill {
    return {
        id: partial.id || generateId(),
        name: partial.name || 'New Skill',
        description: partial.description || '',
        content: partial.content || '',
        tags: partial.tags || [],
        filePath: partial.filePath,
        folderPath: partial.folderPath,
        sha: partial.sha,
        createdAt: partial.createdAt || new Date().toISOString(),
        updatedAt: partial.updatedAt || new Date().toISOString(),
    };
}

/**
 * Generate a unique ID for a skill
 */
function generateId(): string {
    return `skill-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Parse markdown file content to Skill object
 */
export function markdownToSkill(content: string, filePath: string, sha?: string): Skill {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
    
    if (!frontmatterMatch) {
        // No frontmatter, treat entire content as skill content
        const name = filePath.split('/').pop()?.replace('.md', '') || 'Unknown';
        return createSkill({
            name,
            content: content,
            filePath,
            sha,
        });
    }

    const frontmatter = frontmatterMatch[1];
    const skillContent = frontmatterMatch[2];

    const parseField = (field: string): string | undefined => {
        const match = frontmatter.match(new RegExp(`^${field}:\\s*(.*)$`, 'm'));
        return match ? match[1].trim() : undefined;
    };

    const parseTags = (): string[] => {
        const tagsMatch = frontmatter.match(/^tags:\s*\[(.*)\]$/m);
        if (tagsMatch) {
            return tagsMatch[1].split(',').map(t => t.trim()).filter(Boolean);
        }
        return [];
    };

    return {
        id: parseField('id') || generateId(),
        name: parseField('name') || filePath.split('/').pop()?.replace('.md', '') || 'Unknown',
        description: parseField('description') || '',
        content: skillContent,
        tags: parseTags(),
        filePath,
        sha,
        createdAt: parseField('createdAt'),
        updatedAt: parseField('updatedAt'),
    };
}
