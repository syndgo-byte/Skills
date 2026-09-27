import * as vscode from 'vscode';
import { PermissionServer } from './PermissionServer';

export class WebviewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  constructor(private readonly extensionUri: vscode.Uri, private readonly server: PermissionServer) {
    server.onDidChange(() => this.refresh());
  }

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    const webviewRoot = vscode.Uri.joinPath(this.extensionUri, 'webview');
    view.webview.options = { enableScripts: true, localResourceRoots: [webviewRoot] };
    view.webview.html = this.html(view.webview, webviewRoot);
    view.webview.onDidReceiveMessage((msg) => {
      if (msg?.type === 'ready') this.refresh();
      else if (msg?.type === 'decide' && Array.isArray(msg.ids)) this.server.decide(msg.ids, msg.decision);
    });
    view.onDidDispose(() => (this.view = undefined));
  }

  private refresh() {
    if (!this.view) return;
    const requests = this.server.list();
    this.view.badge = requests.length ? { value: requests.length, tooltip: `${requests.length}개 대기 중` } : undefined;
    this.view.webview.postMessage({ type: 'requests', requests, listening: this.server.listening });
  }

  private html(webview: vscode.Webview, root: vscode.Uri): string {
    const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const script = webview.asWebviewUri(vscode.Uri.joinPath(root, 'script.js'));
    const style = webview.asWebviewUri(vscode.Uri.joinPath(root, 'style.css'));
    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${style}">
</head>
<body>
  <div id="offline" class="offline" hidden>다른 VSCode 창이 이미 요청을 받고 있어요. 그 창의 사이드바를 확인하세요.</div>
  <div class="toolbar">
    <button id="allowAll" class="btn primary">모두 허용</button>
    <button id="denyAll" class="btn danger">모두 거부</button>
  </div>
  <div class="toolbar">
    <button id="allowSelected" class="btn" disabled>선택 허용</button>
    <button id="denySelected" class="btn" disabled>선택 거부</button>
  </div>
  <div id="list"></div>
  <script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
  }
}
