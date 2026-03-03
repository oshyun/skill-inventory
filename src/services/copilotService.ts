import * as vscode from 'vscode';
import * as os from 'os';
import { Skill } from '../models/skill';

const SKILL_FILE = 'SKILL.md';

export class CopilotService {
	/**
	 * Get configured sync targets from settings.
	 * Returns array of enabled sync target paths.
	 */
	static getSyncTargets(): string[] {
		const targets = vscode.workspace.getConfiguration('skillInventory').get<Record<string, boolean>>('target', {
			'.agents/skills': false,
			'.claude/skills': true,
			'.github/skills': false,
			'~/.agents/skills': false,
			'~/.claude/skills': true,
			'~/.github/skills': false,
		});
		return Object.entries(targets)
			.filter(([, enabled]) => enabled)
			.map(([path]) => path);
	}

	/**
	 * Sync skills to configured target directories mirroring the repo folder structure.
	 */
	static async syncSkills(skills: Skill[]): Promise<void> {
		const wsFolder = vscode.workspace.workspaceFolders?.[0];
		if (!wsFolder) {
			return;
		}

		const syncTargets = this.getSyncTargets();
		for (const skillsDir of syncTargets) {
			await this.syncSkillsToDir(wsFolder, skillsDir, skills);
		}
	}

	/**
	 * Resolve a sync target path to a URI.
	 * ~ paths resolve to home directory; relative paths resolve to workspace.
	 */
	private static resolveTargetUri(wsFolder: vscode.WorkspaceFolder, targetPath: string): vscode.Uri {
		if (targetPath.startsWith('~/') || targetPath === '~') {
			const resolved = targetPath.replace(/^~/, os.homedir());
			return vscode.Uri.file(resolved);
		}
		return vscode.Uri.joinPath(wsFolder.uri, targetPath);
	}

	/**
	 * Sync skills into a single target directory.
	 */
	private static async syncSkillsToDir(
		wsFolder: vscode.WorkspaceFolder,
		skillsDir: string,
		skills: Skill[],
	): Promise<void> {
		const skillsUri = this.resolveTargetUri(wsFolder, skillsDir);
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
		const removeStale = vscode.workspace
			.getConfiguration('skillInventory.sync')
			.get<boolean>('removeStaleSkills', false);
		const staleNames = await findStaleNames(skillsUri, desiredPaths);
		if (staleNames.length > 0) {
			if (removeStale) {
				const answer = await vscode.window.showWarningMessage(
					`${staleNames.length} skill(s) not found in remote will be deleted: ${staleNames.join(', ')}`,
					{
						modal: true,
						detail: 'To stop seeing this prompt, disable "Remove Stale Skills" in settings.',
					},
					'Delete',
					'Open Settings'
				);
				if (answer === 'Delete') {
					await cleanStale(skillsUri, '', desiredPaths, skillRoots);
				} else if (answer === 'Open Settings') {
					vscode.commands.executeCommand('workbench.action.openSettings', 'skillInventory.sync.removeStaleSkills');
				}
			} else {
				vscode.window.showWarningMessage(
					`Local skills not found in remote: ${staleNames.join(', ')}. Enable removeStaleSkills in settings to delete them automatically.`
				);
			}
		}
	}

	/**
	 * Remove all skill directories under .github/skills/ (except .gitignore).
	 */
	static async cleanAll(): Promise<void> {
		const wsFolder = vscode.workspace.workspaceFolders?.[0];
		if (!wsFolder) {
			return;
		}

		for (const skillsDir of this.getSyncTargets()) {
			const skillsUri = this.resolveTargetUri(wsFolder, skillsDir);

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
			.getConfiguration('skillInventory.sync')
			.get<boolean>('autoSync', true);
	}
}

// --- helpers ---

const GITIGNORE_CONTENT = `# Auto-generated by Skill Inventory extension — do not commit these files
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

async function findStaleNames(
	dirUri: vscode.Uri,
	desiredPaths: Set<string>,
): Promise<string[]> {
	let entries: [string, vscode.FileType][];
	try {
		entries = await vscode.workspace.fs.readDirectory(dirUri);
	} catch {
		return [];
	}

	const stale: string[] = [];
	for (const [name, type] of entries) {
		if (name === '.gitignore') {
			continue;
		}
		if (type === vscode.FileType.Directory && !desiredPaths.has(name)) {
			stale.push(name);
		}
	}
	return stale;
}
