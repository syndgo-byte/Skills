import * as vscode from 'vscode';
import { PermissionServer } from './PermissionServer';
import { WebviewProvider } from './WebviewProvider';

export async function activate(context: vscode.ExtensionContext) {
  const server = new PermissionServer();
  context.subscriptions.push(server);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('permissionManagerView', new WebviewProvider(context.extensionUri, server), {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
  status.command = 'permissionManagerView.focus';
  status.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  context.subscriptions.push(status);

  let previous = 0;
  server.onDidChange(() => {
    const count = server.list().length;
    if (count > 0) {
      status.text = `$(lock) Claude 허가 대기 ${count}`;
      status.show();
    } else {
      status.hide();
    }
    if (previous === 0 && count > 0) {
      vscode.window.showInformationMessage('Claude Code가 허가를 기다리고 있어요.', '열기').then((choice) => {
        if (choice) vscode.commands.executeCommand('permissionManagerView.focus');
      });
    }
    previous = count;
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('permissionManager.open', () => vscode.commands.executeCommand('permissionManagerView.focus'))
  );

  await server.start();
}

export function deactivate() {}
