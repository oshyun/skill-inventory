import * as vscode from 'vscode';
import * as os from 'os';

export const PAT_SECRET_KEY = 'skillInventory.pat';

export function expandTilde(p: string): string {
	if (p.startsWith('~/') || p === '~') {
		return p.replace(/^~/, os.homedir());
	}
	return p;
}

export function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : 'Unknown error';
}

export function showMessageWithAction(
	level: 'error' | 'warning' | 'info',
	message: string,
	actionLabel: string,
	command: string,
	...commandArgs: unknown[]
): void {
	const show = level === 'error'
		? vscode.window.showErrorMessage
		: level === 'warning'
			? vscode.window.showWarningMessage
			: vscode.window.showInformationMessage;

	show(message, actionLabel).then(selection => {
		if (selection === actionLabel) {
			vscode.commands.executeCommand(command, ...commandArgs);
		}
	});
}
