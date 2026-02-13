import * as vscode from 'vscode';
import { Skill } from '../models/skill';

const MARKER = '<!-- fdc-skills-generated -->';
const PROMPTS_DIR = '.github/prompts';

export class CopilotService {
	/**
	 * Sync skills to .github/prompts/ as prompt.md files for Copilot Chat.
	 * Skips user-created files (those without the fdc-skills marker).
	 * Skips writing if content hasn't changed.
	 */
	static async syncSkills(skills: Skill[]): Promise<void> {
		const wsFolder = vscode.workspace.workspaceFolders?.[0];
		if (!wsFolder) {
			return;
		}

		const promptsUri = vscode.Uri.joinPath(wsFolder.uri, PROMPTS_DIR);

		// Ensure directory exists
		await vscode.workspace.fs.createDirectory(promptsUri);

		const desiredFiles = new Set<string>();

		for (const skill of skills) {
			const fileName = `${skill.id}.prompt.md`;
			desiredFiles.add(fileName);

			const fileUri = vscode.Uri.joinPath(promptsUri, fileName);
			const newContent = buildPromptContent(skill);

			// Check if file already exists
			let existingContent: string | undefined;
			try {
				const raw = await vscode.workspace.fs.readFile(fileUri);
				existingContent = Buffer.from(raw).toString('utf-8');
			} catch {
				// file doesn't exist yet
			}

			// Skip user-created files (no marker)
			if (existingContent !== undefined && !existingContent.includes(MARKER)) {
				continue;
			}

			// Skip if content unchanged
			if (existingContent === newContent) {
				continue;
			}

			await vscode.workspace.fs.writeFile(fileUri, Buffer.from(newContent, 'utf-8'));
		}

		// Remove stale generated files
		try {
			const entries = await vscode.workspace.fs.readDirectory(promptsUri);
			for (const [name, type] of entries) {
				if (type !== vscode.FileType.File) {
					continue;
				}
				if (!name.endsWith('.prompt.md')) {
					continue;
				}
				if (desiredFiles.has(name)) {
					continue;
				}

				const fileUri = vscode.Uri.joinPath(promptsUri, name);
				let content: string;
				try {
					const raw = await vscode.workspace.fs.readFile(fileUri);
					content = Buffer.from(raw).toString('utf-8');
				} catch {
					continue;
				}

				// Only delete files we generated
				if (content.includes(MARKER)) {
					await vscode.workspace.fs.delete(fileUri);
				}
			}
		} catch {
			// directory may not exist or be unreadable — ignore
		}
	}

	/**
	 * Remove all fdc-skills-generated prompt files.
	 */
	static async cleanAll(): Promise<void> {
		const wsFolder = vscode.workspace.workspaceFolders?.[0];
		if (!wsFolder) {
			return;
		}

		const promptsUri = vscode.Uri.joinPath(wsFolder.uri, PROMPTS_DIR);

		let entries: [string, vscode.FileType][];
		try {
			entries = await vscode.workspace.fs.readDirectory(promptsUri);
		} catch {
			return; // directory doesn't exist
		}

		for (const [name, type] of entries) {
			if (type !== vscode.FileType.File || !name.endsWith('.prompt.md')) {
				continue;
			}

			const fileUri = vscode.Uri.joinPath(promptsUri, name);
			try {
				const raw = await vscode.workspace.fs.readFile(fileUri);
				const content = Buffer.from(raw).toString('utf-8');
				if (content.includes(MARKER)) {
					await vscode.workspace.fs.delete(fileUri);
				}
			} catch {
				// ignore individual file errors
			}
		}
	}

	/**
	 * Check if auto-sync is enabled in settings.
	 */
	static isAutoSyncEnabled(): boolean {
		return vscode.workspace
			.getConfiguration('fdcSkills.copilot')
			.get<boolean>('autoSync', true);
	}
}

function buildPromptContent(skill: Skill): string {
	const descLine = skill.description
		? skill.description.replace(/"/g, '\\"')
		: skill.name;

	const lines: string[] = [
		'---',
		`description: "${descLine}"`,
		'---',
		MARKER,
		'',
		skill.content,
	];

	return lines.join('\n');
}
