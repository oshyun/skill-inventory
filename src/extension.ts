import * as vscode from 'vscode';
import { GitHubService } from './services/githubService';
import { SkillsTreeProvider } from './providers/skillsTreeProvider';
import { registerSkillCommands } from './commands/skillCommands';
import { CopilotService } from './services/copilotService';
import { PAT_SECRET_KEY, showMessageWithAction } from './utils';
import { TreeNode } from './models/skill';

let pollingTimer: ReturnType<typeof setInterval> | undefined;
let lastKnownSha: string | undefined;
let treeViewRef: vscode.TreeView<TreeNode> | undefined;

/** Update the context key and tree-view description badge for sync state */
function updateSyncContext(): void {
	const enabled = CopilotService.isAutoSyncEnabled();
	vscode.commands.executeCommand('setContext', 'skillInventory.syncEnabled', enabled);
}

/**
 * This method is called when your extension is activated
 */
export async function activate(context: vscode.ExtensionContext) {
	console.log('Skill Inventory Manager is now active!');

	vscode.commands.executeCommand('setContext', 'skillInventory.isReady', false);

	// Initialize services with extension path for .env file and SecretStorage for PAT
	const githubService = new GitHubService(context.extensionPath, context.secrets);
	await githubService.refreshConfig();

	// Initialize tree view provider
	const skillsTreeProvider = new SkillsTreeProvider(githubService);

	// Register tree view
	const treeView = vscode.window.createTreeView('skillInventoryView', {
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

	// Reload config when PAT changes in SecretStorage
	context.subscriptions.push(
		context.secrets.onDidChange(async (e) => {
			if (e.key === PAT_SECRET_KEY) {
				await githubService.refreshConfig();
				lastKnownSha = undefined;
				skillsTreeProvider.refresh();
			}
		})
	);

	// Listen for all configuration changes in one handler
	checkAgentSkillsConfig();
	checkAgentSkillsLocations();
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(async (e) => {
			if (e.affectsConfiguration('skillInventory.source')) {
				await githubService.refreshConfig();
				lastKnownSha = undefined;
				skillsTreeProvider.refresh();
			}

			if (e.affectsConfiguration('skillInventory.sync.autoSync')) {
				updateSyncContext();
				startPolling(githubService, skillsTreeProvider);
				if (CopilotService.isAutoSyncEnabled()) {
					const skills = skillsTreeProvider.getSkills();
					if (skills.length > 0) {
						try {
							await CopilotService.syncSkills(skills);
						} catch (error) {
							console.error('Sync re-sync failed:', error);
						}
					}
				} else {
					try {
						await CopilotService.cleanAll();
					} catch (error) {
						console.error('Sync cleanAll failed:', error);
					}
				}
			}

			if (e.affectsConfiguration('skillInventory.sync.intervalSeconds')) {
				startPolling(githubService, skillsTreeProvider);
			}

			if (e.affectsConfiguration('skillInventory.sync.keepLocalSkills')) {
				skillsTreeProvider.refreshTree();
			}

			if (e.affectsConfiguration('chat.useAgentSkills')) {
				checkAgentSkillsConfig();
			}

			if (e.affectsConfiguration('chat.agentSkillsLocations') ||
				e.affectsConfiguration('skillInventory.target')) {
				checkAgentSkillsLocations();
			}
		})
	);

	// Always try to load skills on startup (config is from .env file)
	skillsTreeProvider.refresh().then(async () => {
		lastKnownSha = await githubService.getLatestCommitSha();
		updateDescription();
		vscode.commands.executeCommand('setContext', 'skillInventory.isReady', true);
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
		? `Updated ${now}`
		: `Checked ${now}`;
}

function getPollingInterval(): number {
	return vscode.workspace
		.getConfiguration('skillInventory.sync')
		.get<number>('intervalSeconds', 30);
}

function startPolling(githubService: GitHubService, provider: SkillsTreeProvider): void {
	stopPolling();

	if (!CopilotService.isAutoSyncEnabled()) {
		return;
	}

	const seconds = getPollingInterval();

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

function checkAgentSkillsConfig(): void {
	const enabled = vscode.workspace.getConfiguration('chat').get<boolean>('useAgentSkills', false);
	if (!enabled) {
		showMessageWithAction(
			'warning',
			'Skill Inventory: Enable chat.useAgentSkills so GitHub Copilot can discover your skills.',
			'Open Settings',
			'workbench.action.openSettings',
			'chat.useAgentSkills'
		);
	}
}

function checkAgentSkillsLocations(): void {
	const locations = vscode.workspace.getConfiguration('chat').get<Record<string, boolean>>('agentSkillsLocations');
	if (!locations) {
		return;
	}

	const hasClaudeSkills = Object.keys(locations).some(loc => loc.includes('.claude/skills'));
	if (!hasClaudeSkills) {
		showMessageWithAction(
			'warning',
			'Skill Inventory: .claude/skills is not in chat.agentSkillsLocations. Claude Code may not discover your skills.',
			'Open Settings',
			'workbench.action.openSettings',
			'chat.agentSkillsLocations'
		);
	}
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
