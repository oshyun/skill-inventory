import * as vscode from 'vscode';

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
