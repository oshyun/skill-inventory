import * as vscode from 'vscode';
import { GitHubService } from './services/githubService';
import { SkillsTreeProvider } from './providers/skillsTreeProvider';
import { registerSkillCommands } from './commands/skillCommands';
import { CopilotService } from './services/copilotService';

/**
 * This method is called when your extension is activated
 */
export function activate(context: vscode.ExtensionContext) {
	console.log('FDC Skills Manager is now active!');

	// Initialize services with extension path for .env file
	const githubService = new GitHubService(context.extensionPath);

	// Initialize tree view provider
	const skillsTreeProvider = new SkillsTreeProvider(githubService);

	// Register tree view
	const treeView = vscode.window.createTreeView('fdcSkillsView', {
		treeDataProvider: skillsTreeProvider,
		showCollapseAll: true,
	});

	context.subscriptions.push(treeView);

	// Register all commands
	registerSkillCommands(context, githubService, skillsTreeProvider);

	// Register Copilot sync command
	context.subscriptions.push(
		vscode.commands.registerCommand('fdcSkills.syncCopilotPrompts', async () => {
			const skills = skillsTreeProvider.getSkills();
			if (skills.length === 0) {
				vscode.window.showWarningMessage('No skills loaded. Refresh skills first.');
				return;
			}

			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: 'Syncing skills to Copilot prompts...',
					cancellable: false,
				},
				async () => {
					try {
						await CopilotService.syncSkills(skills);
						vscode.window.showInformationMessage(
							`Synced ${skills.length} skill(s) to .github/prompts/`
						);
					} catch (error) {
						vscode.window.showErrorMessage(
							`Copilot sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`
						);
					}
				}
			);
		})
	);

	// Listen for configuration changes
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(async (e) => {
			if (e.affectsConfiguration('fdcSkills.github')) {
				githubService.refreshConfig();
				skillsTreeProvider.refresh();
			}

			if (e.affectsConfiguration('fdcSkills.copilot.autoSync')) {
				if (CopilotService.isAutoSyncEnabled()) {
					const skills = skillsTreeProvider.getSkills();
					if (skills.length > 0) {
						try {
							await CopilotService.syncSkills(skills);
						} catch (error) {
							console.error('Copilot re-sync failed:', error);
						}
					}
				} else {
					try {
						await CopilotService.cleanAll();
					} catch (error) {
						console.error('Copilot cleanAll failed:', error);
					}
				}
			}
		})
	);

	// Always try to load skills on startup (config is from .env file)
	skillsTreeProvider.refresh();
}

/**
 * This method is called when your extension is deactivated
 */
export function deactivate() {}
