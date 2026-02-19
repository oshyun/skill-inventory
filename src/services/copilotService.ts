import * as vscode from 'vscode';
import { Skill, SkillFile } from '../models/skill';

const SKILLS_DIR = '.github/skills';
const CLAUDE_SKILLS_DIR = '.claude/skills';
const ALL_SKILLS_DIRS = [SKILLS_DIR, CLAUDE_SKILLS_DIR];
const SKILL_FILE = 'SKILL.md';

export interface FileChange {
	relativePath: string;
	newContent: string;
}

export interface SkillChange {
	skill: Skill;
	changedFiles: FileChange[];
}

export class CopilotService {
	/**
	 * Sync skills to .github/skills/ mirroring the repo folder structure.
	 */
	static async syncSkills(skills: Skill[]): Promise<void> {
		const wsFolder = vscode.workspace.workspaceFolders?.[0];
		if (!wsFolder) {
			return;
		}

		for (const skillsDir of ALL_SKILLS_DIRS) {
			await this.syncSkillsToDir(wsFolder, skillsDir, skills);
		}
	}

	/**
	 * Sync skills into a single target directory.
	 */
	private static async syncSkillsToDir(
		wsFolder: vscode.WorkspaceFolder,
		skillsDir: string,
		skills: Skill[],
	): Promise<void> {
		const skillsUri = vscode.Uri.joinPath(wsFolder.uri, skillsDir);
		await vscode.workspace.fs.createDirectory(skillsUri);
		await ensureGitignore(skillsUri);

		// Track all desired paths (including intermediate folders and skill sub-dirs)
		const desiredPaths = new Set<string>();
		// Track skill root paths so cleanStale doesn't recurse into them
		const skillRoots = new Set<string>();

		for (const skill of skills) {
			const localPath = skill.localPath || skill.id;
			skillRoots.add(localPath);
			// Register this path and all parent segments
			const parts = localPath.split('/');
			for (let i = 1; i <= parts.length; i++) {
				desiredPaths.add(parts.slice(0, i).join('/'));
			}

			const dirUri = vscode.Uri.joinPath(skillsUri, localPath);
			await vscode.workspace.fs.createDirectory(dirUri);

			// Build unified file list: SKILL.md + additional files
			const allFiles: Array<{ relativePath: string; content: string }> = [
				{ relativePath: SKILL_FILE, content: skill.rawContent || skill.content },
				...(skill.files || []),
			];

			for (const file of allFiles) {
				const destUri = vscode.Uri.joinPath(dirUri, ...file.relativePath.split('/'));

				let existing: string | undefined;
				try {
					const raw = await vscode.workspace.fs.readFile(destUri);
					existing = Buffer.from(raw).toString('utf-8');
				} catch {
					// doesn't exist yet
				}

				if (existing === file.content) {
					continue;
				}

				// Create parent directory for nested files
				if (file.relativePath.includes('/')) {
					const parentUri = vscode.Uri.joinPath(dirUri, ...file.relativePath.split('/').slice(0, -1));
					await vscode.workspace.fs.createDirectory(parentUri);
				}
				await vscode.workspace.fs.writeFile(destUri, Buffer.from(file.content, 'utf-8'));
			}
		}

		// Remove stale directories (but don't recurse into skill roots)
		await cleanStale(skillsUri, '', desiredPaths, skillRoots);
	}

	/**
	 * Detect locally modified skills by comparing local files with original content.
	 */
	static async getModifiedSkills(skills: Skill[]): Promise<SkillChange[]> {
		const wsFolder = vscode.workspace.workspaceFolders?.[0];
		if (!wsFolder) {
			return [];
		}

		const changes: SkillChange[] = [];
		const seen = new Set<string>();

		// Check all skill directories for modifications (first match wins per skill)
		for (const skillsDir of ALL_SKILLS_DIRS) {
			for (const skill of skills) {
				if (seen.has(skill.id)) {
					continue;
				}
				const localPath = skill.localPath || skill.id;
				const dirUri = vscode.Uri.joinPath(wsFolder.uri, skillsDir, localPath);

			const allFiles: Array<{ relativePath: string; content: string }> = [
				{ relativePath: SKILL_FILE, content: skill.rawContent || skill.content },
				...(skill.files || []),
			];

			const changedFiles: FileChange[] = [];

			for (const file of allFiles) {
				const fileUri = vscode.Uri.joinPath(dirUri, ...file.relativePath.split('/'));

				let currentContent: string;
				try {
					const raw = await vscode.workspace.fs.readFile(fileUri);
					currentContent = Buffer.from(raw).toString('utf-8');
				} catch {
					continue;
				}

				if (currentContent !== file.content) {
					changedFiles.push({ relativePath: file.relativePath, newContent: currentContent });
				}
			}

				if (changedFiles.length > 0) {
					changes.push({ skill, changedFiles });
					seen.add(skill.id);
				}
			}
		}

		return changes;
	}

	/**
	 * Remove all skill directories under .github/skills/ (except .gitignore).
	 */
	static async cleanAll(): Promise<void> {
		const wsFolder = vscode.workspace.workspaceFolders?.[0];
		if (!wsFolder) {
			return;
		}

		for (const skillsDir of ALL_SKILLS_DIRS) {
			const skillsUri = vscode.Uri.joinPath(wsFolder.uri, skillsDir);

			let entries: [string, vscode.FileType][];
			try {
				entries = await vscode.workspace.fs.readDirectory(skillsUri);
			} catch {
				continue;
			}

			for (const [name, type] of entries) {
				if (name === '.gitignore') {
					continue;
				}
				try {
					const uri = vscode.Uri.joinPath(skillsUri, name);
					await vscode.workspace.fs.delete(uri, { recursive: true });
				} catch {
					// ignore
				}
			}
		}
	}

	static isAutoSyncEnabled(): boolean {
		return vscode.workspace
			.getConfiguration('fdcSkills.copilot')
			.get<boolean>('autoSync', true);
	}
}

// --- helpers ---

const GITIGNORE_CONTENT = `# Auto-generated by FDC Skills extension — do not commit these files
*
`;

async function ensureGitignore(skillsUri: vscode.Uri): Promise<void> {
	const uri = vscode.Uri.joinPath(skillsUri, '.gitignore');
	try {
		await vscode.workspace.fs.stat(uri);
	} catch {
		await vscode.workspace.fs.writeFile(uri, Buffer.from(GITIGNORE_CONTENT, 'utf-8'));
	}
}

async function cleanStale(
	dirUri: vscode.Uri,
	relativePath: string,
	desiredPaths: Set<string>,
	skillRoots: Set<string>
): Promise<void> {
	let entries: [string, vscode.FileType][];
	try {
		entries = await vscode.workspace.fs.readDirectory(dirUri);
	} catch {
		return;
	}

	for (const [name, type] of entries) {
		if (name === '.gitignore') {
			continue;
		}

		const childPath = relativePath ? `${relativePath}/${name}` : name;
		const childUri = vscode.Uri.joinPath(dirUri, name);

		if (type === vscode.FileType.Directory) {
			if (!desiredPaths.has(childPath)) {
				await vscode.workspace.fs.delete(childUri, { recursive: true });
			} else if (!skillRoots.has(childPath)) {
				// Only recurse into intermediate folders, not into skill directories
				await cleanStale(childUri, childPath, desiredPaths, skillRoots);
			}
		}
	}
}
