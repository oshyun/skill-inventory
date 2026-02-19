import * as vscode from 'vscode';
import { GitHubService } from './services/githubService';
import { SkillsTreeProvider } from './providers/skillsTreeProvider';
import { registerSkillCommands } from './commands/skillCommands';
import { CopilotService } from './services/copilotService';

let pollingTimer: ReturnType<typeof setInterval> | undefined;
let lastKnownSha: string | undefined;
let treeViewRef: vscode.TreeView<any> | undefined;

/** Update the context key and tree-view description badge for sync state */
function updateSyncContext(): void {
	const enabled = CopilotService.isAutoSyncEnabled();
	vscode.commands.executeCommand('setContext', 'fdcSkills.syncEnabled', enabled);
}

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

	treeViewRef = treeView;
	skillsTreeProvider.setTreeView(treeView);
	context.subscriptions.push(treeView);

	// Set initial sync context
	updateSyncContext();

	// Register all commands
	registerSkillCommands(context, githubService, skillsTreeProvider);

	// Register enable/disable sync commands
	context.subscriptions.push(
		vscode.commands.registerCommand('fdcSkills.enableSync', async () => {
			const config = vscode.workspace.getConfiguration('fdcSkills.copilot');
			await config.update('autoSync', true, vscode.ConfigurationTarget.Global);
			updateSyncContext();
			vscode.window.showInformationMessage('Skills auto-sync: ON');
			const skills = skillsTreeProvider.getSkills();
			if (skills.length > 0) {
				try {
					await CopilotService.syncSkills(skills);
				} catch (error) {
					console.error('Sync after enable failed:', error);
				}
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('fdcSkills.disableSync', async () => {
			const config = vscode.workspace.getConfiguration('fdcSkills.copilot');
			await config.update('autoSync', false, vscode.ConfigurationTarget.Global);
			updateSyncContext();
			vscode.window.showInformationMessage('Skills auto-sync: OFF');
			try {
				await CopilotService.cleanAll();
			} catch (error) {
				console.error('CleanAll after disable failed:', error);
			}
		})
	);

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
							`Synced ${skills.length} skill(s) to .github/skills/`
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
				lastKnownSha = undefined;
				skillsTreeProvider.refresh();
			}

			if (e.affectsConfiguration('fdcSkills.copilot.autoSync')) {
				updateSyncContext();
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

			if (e.affectsConfiguration('fdcSkills.autoRefreshInterval')) {
				startPolling(githubService, skillsTreeProvider);
			}
		})
	);

	// Always try to load skills on startup (config is from .env file)
	skillsTreeProvider.refresh().then(async () => {
		lastKnownSha = await githubService.getLatestCommitSha();
		updateDescription();
	});

	// Start auto-refresh polling
	startPolling(githubService, skillsTreeProvider);

	context.subscriptions.push({ dispose: stopPolling });
}

function formatTime(date: Date): string {
	return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function updateDescription(changed?: boolean): void {
	if (!treeViewRef) {
		return;
	}
	const now = formatTime(new Date());
	treeViewRef.description = changed
		? `변경 감지 ${now}`
		: `마지막 확인 ${now}`;
}

function getPollingInterval(): number {
	return vscode.workspace
		.getConfiguration('fdcSkills')
		.get<number>('autoRefreshInterval', 30);
}

function startPolling(githubService: GitHubService, provider: SkillsTreeProvider): void {
	stopPolling();

	const seconds = getPollingInterval();
	if (seconds <= 0) {
		return;
	}

	pollingTimer = setInterval(async () => {
		try {
			const sha = await githubService.getLatestCommitSha();
			if (sha && sha !== lastKnownSha) {
				lastKnownSha = sha;
				await provider.refresh();
				updateDescription(true);
			} else {
				updateDescription(false);
			}
		} catch {
			// ignore polling errors
		}
	}, seconds * 1000);
}

function stopPolling(): void {
	if (pollingTimer) {
		clearInterval(pollingTimer);
		pollingTimer = undefined;
	}
}

/**
 * This method is called when your extension is deactivated
 */
export function deactivate() {
	stopPolling();
}
