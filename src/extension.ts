import * as vscode from 'vscode';
import { GitHubService } from './services/githubService';
import { SkillsTreeProvider } from './providers/skillsTreeProvider';
import { registerSkillCommands } from './commands/skillCommands';
import { CopilotService } from './services/copilotService';
import { showMessageWithAction } from './utils';

let pollingTimer: ReturnType<typeof setInterval> | undefined;
let lastKnownSha: string | undefined;
let treeViewRef: vscode.TreeView<any> | undefined;

/** Update the context key and tree-view description badge for sync state */
function updateSyncContext(): void {
	const enabled = CopilotService.isAutoSyncEnabled();
	vscode.commands.executeCommand('setContext', 'skillInventory.syncEnabled', enabled);
}

/**
 * This method is called when your extension is activated
 */
export function activate(context: vscode.ExtensionContext) {
	console.log('Skill Inventory Manager is now active!');

	// Initialize services with extension path for .env file
	const githubService = new GitHubService(context.extensionPath);

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

	// Listen for configuration changes
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(async (e) => {
			if (e.affectsConfiguration('skillInventory.source')) {
				githubService.refreshConfig();
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
		})
	);

	// Warn if chat.useAgentSkills is not enabled
	checkAgentSkillsConfig();
	// Warn if .claude/skills is missing from chat.agentSkillsLocations
	checkAgentSkillsLocations();
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e) => {
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
			'Skill Inventory: GitHub Copilot이 스킬을 인식하려면 chat.useAgentSkills를 활성화해야 합니다.',
			'설정 열기',
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
			'Skill Inventory: chat.agentSkillsLocations에 .claude/skills 경로가 없습니다. Claude Code가 스킬을 인식하지 못할 수 있으니 경로를 점검해 주세요.',
			'설정 열기',
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
