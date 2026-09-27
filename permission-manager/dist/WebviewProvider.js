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
            console.log('📨 Webview message received:', msg?.type);
            if (msg?.type === 'ready') {
                console.log('✅ Ready message, refreshing...');
                this.refresh();
            }
            else if (msg?.type === 'decide' && Array.isArray(msg.ids)) {
                console.log('✅ Decide message:', msg.ids, msg.decision);
                this.server.decide(msg.ids, msg.decision);
            }
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
        const style = webview.asWebviewUri(vscode.Uri.joinPath(root, 'style.css'));
        return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline';">
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

  <script>
const vscode = acquireVsCodeApi();
let requests = [];
const selected = new Set();
const $ = (id) => document.getElementById(id);

function decide(ids, decision) {
  if (ids.length === 0) return;
  ids.forEach((id) => selected.delete(id));
  vscode.postMessage({ type: 'decide', ids, decision });
}

$('allowAll').addEventListener('click', () => decide(requests.map((r) => r.id), 'allow'));
$('denyAll').addEventListener('click', () => decide(requests.map((r) => r.id), 'deny'));
$('allowSelected').addEventListener('click', () => decide([...selected], 'allow'));
$('denySelected').addEventListener('click', () => decide([...selected], 'deny'));

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function render() {
  const list = $('list');
  list.replaceChildren();

  for (const id of [...selected]) {
    if (!requests.some((r) => r.id === id)) selected.delete(id);
  }

  $('allowAll').disabled = $('denyAll').disabled = requests.length === 0;
  $('allowSelected').disabled = $('denySelected').disabled = selected.size === 0;

  if (requests.length === 0) {
    list.appendChild(el('div', 'empty', '대기 중인 허가 요청이 없어요'));
    return;
  }

  for (const req of requests) {
    const item = el('div', 'item');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = selected.has(req.id);
    box.addEventListener('change', () => {
      box.checked ? selected.add(req.id) : selected.delete(req.id);
      render();
    });

    const info = el('div', 'info');
    info.appendChild(el('div', 'tool', req.toolName));
    info.appendChild(el('div', 'summary', req.summary));
    if (req.cwd) info.appendChild(el('div', 'cwd', req.cwd));

    const actions = el('div', 'actions');
    const allow = el('button', 'btn primary small', '허용');
    allow.addEventListener('click', () => decide([req.id], 'allow'));
    const deny = el('button', 'btn danger small', '거부');
    deny.addEventListener('click', () => decide([req.id], 'deny'));
    actions.append(allow, deny);

    item.append(box, info, actions);
    list.appendChild(item);
  }
}

window.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg?.type !== 'requests') return;
  requests = msg.requests || [];
  $('offline').hidden = msg.listening;
  render();
});

vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
    }
}
exports.WebviewProvider = WebviewProvider;
