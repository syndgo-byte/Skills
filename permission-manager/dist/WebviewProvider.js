"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebviewProvider = void 0;
const vscode = __importStar(require("vscode"));
class WebviewProvider {
    constructor(extensionUri, server) {
        this.extensionUri = extensionUri;
        this.server = server;
        server.onDidChange(() => this.refresh());
    }
    resolveWebviewView(view) {
        this.view = view;
        const webviewRoot = vscode.Uri.joinPath(this.extensionUri, 'webview');
        view.webview.options = { enableScripts: true, localResourceRoots: [webviewRoot] };
        view.webview.html = this.html(view.webview, webviewRoot);
        view.webview.onDidReceiveMessage((msg) => {
            if (msg?.type === 'ready')
                this.refresh();
            else if (msg?.type === 'decide' && Array.isArray(msg.ids))
                this.server.decide(msg.ids, msg.decision);
        });
        view.onDidDispose(() => (this.view = undefined));
    }
    refresh() {
        if (!this.view)
            return;
        const requests = this.server.list();
        this.view.badge = requests.length ? { value: requests.length, tooltip: `${requests.length}개 대기 중` } : undefined;
        this.view.webview.postMessage({ type: 'requests', requests, listening: this.server.listening });
    }
    html(webview, root) {
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
exports.WebviewProvider = WebviewProvider;
