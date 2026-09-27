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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
// --- Paths ---
const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const AGY_BRAIN_DIR = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
const CLAUDE_VIEW_TYPE = 'claudeVSCodePanel';
const SCAN_MAX_AGE = 7 * 24 * 3600 * 1000;
const CLAUDE_STATE_FILE = path.join(os.homedir(), '.claude', 'token-router', 'state.json');
function limits() {
    let st = {};
    try {
        st = JSON.parse(fs.readFileSync(CLAUDE_STATE_FILE, 'utf8'));
    }
    catch { }
    return { threshold: st.handoffTokens || 80000, loop: st.loopTokens || 200000 };
}
const COLORS = {
    '🟢': '#22c55e',
    '🟡': '#eab308',
    '🟠': '#f97316',
    '🔴': '#ef4444',
};
const ICONS = {
    '🟢': '$(circle-filled)',
    '🟡': '$(warning)',
    '🟠': '$(circle-outline)',
    '🔴': '$(error)',
};
const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);
// --- Claude Scanner ---
const transcripts = new Map();
function updateTranscript(file, stat) {
    let t = transcripts.get(file);
    if (t && t.size === stat.size && t.mtime === stat.mtimeMs)
        return;
    if (!t || stat.size < t.size) {
        t = { size: 0, mtime: 0, leftover: '', aiTitle: '', customTitle: '', context: 0, model: '' };
        transcripts.set(file, t);
    }
    const len = stat.size - t.size;
    if (len > 0) {
        const fd = fs.openSync(file, 'r');
        try {
            const buf = Buffer.alloc(len);
            fs.readSync(fd, buf, 0, len, t.size);
            const lines = (t.leftover + buf.toString('utf8')).split('\n');
            t.leftover = lines.pop() || '';
            for (const line of lines)
                parseLine(t, line);
        }
        finally {
            fs.closeSync(fd);
        }
    }
    t.size = stat.size;
    t.mtime = stat.mtimeMs;
}
function parseLine(t, line) {
    if (!line)
        return;
    let e;
    try {
        e = JSON.parse(line);
    }
    catch {
        return;
    }
    if (e.type === 'ai-title' && e.aiTitle)
        t.aiTitle = e.aiTitle;
    else if (e.type === 'custom-title' && e.customTitle)
        t.customTitle = e.customTitle;
    else if (e.subtype === 'compact_boundary')
        t.context = 0;
    else if (e.type === 'assistant' && e.message?.usage) {
        const u = e.message.usage;
        t.context = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
        t.model = e.message.model || t.model;
    }
}
function scanClaudeTranscripts() {
    const now = Date.now();
    let dirs = [];
    try {
        dirs = fs.readdirSync(CLAUDE_PROJECTS_DIR);
    }
    catch {
        return;
    }
    for (const d of dirs) {
        const dir = path.join(CLAUDE_PROJECTS_DIR, d);
        let files = [];
        try {
            files = fs.readdirSync(dir);
        }
        catch {
            continue;
        }
        for (const f of files) {
            if (!f.endsWith('.jsonl'))
                continue;
            const full = path.join(dir, f);
            try {
                const stat = fs.statSync(full);
                if (now - stat.mtimeMs > SCAN_MAX_AGE && !transcripts.has(full))
                    continue;
                updateTranscript(full, stat);
            }
            catch { }
        }
    }
}
function openClaudeTabs() {
    const tabs = [];
    for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
            const input = tab.input;
            if (input instanceof vscode.TabInputWebview && input.viewType.endsWith(CLAUDE_VIEW_TYPE)) {
                tabs.push({ label: tab.label, active: tab.isActive && group.isActive });
            }
        }
    }
    return tabs;
}
function statusForClaude(tab, threshold, loop) {
    const label = tab.label.trim();
    const cut = label.replace(/(\.\.\.|…)$/, '').trim();
    const isCut = cut !== label;
    let best;
    for (const t of transcripts.values()) {
        const title = (t.customTitle || t.aiTitle).trim();
        if (!title)
            continue;
        const hit = title === label || (isCut && title.startsWith(cut));
        if (hit && (!best || t.mtime > best.mtime))
            best = t;
    }
    const context = best ? best.context : 0;
    const model = best ? best.model : '';
    const emoji = context >= loop ? '🔴' : context >= threshold ? '🟠' : context >= threshold * 0.875 ? '🟡' : '🟢';
    return {
        source: 'claude',
        label: tab.label,
        active: tab.active,
        matched: !!best,
        context,
        model,
        emoji,
        color: COLORS[emoji],
        percent: Math.round((context / loop) * 100),
        loop,
        atLoop: context >= loop,
    };
}
// --- Antigravity Scanner ---
function scanAntigravitySession() {
    try {
        if (!fs.existsSync(AGY_BRAIN_DIR))
            return null;
        const dirs = fs.readdirSync(AGY_BRAIN_DIR);
        let latest = null;
        for (const d of dirs) {
            if (d === 'tempmediaStorage')
                continue;
            const logDir = path.join(AGY_BRAIN_DIR, d, '.system_generated', 'logs');
            const candidateFull = path.join(logDir, 'transcript_full.jsonl');
            const candidateNorm = path.join(logDir, 'transcript.jsonl');
            const targetFile = fs.existsSync(candidateFull) ? candidateFull : (fs.existsSync(candidateNorm) ? candidateNorm : null);
            if (!targetFile)
                continue;
            try {
                const stat = fs.statSync(targetFile);
                if (!latest || stat.mtimeMs > latest.stat.mtimeMs) {
                    latest = { id: d, file: targetFile, stat };
                }
            }
            catch { }
        }
        if (!latest)
            return null;
        // Tokens estimate: ~3.8 bytes per token for typical mixed Korean/English code context
        const tokens = Math.round(latest.stat.size / 3.8);
        const maxTokens = 200000;
        const percent = Math.min(100, Math.round((tokens / maxTokens) * 100));
        let title = `Session ${latest.id.slice(0, 8)}`;
        let model = 'Gemini 3.8 Flash';
        try {
            const fd = fs.openSync(latest.file, 'r');
            const readBuf = Buffer.alloc(Math.min(4096, latest.stat.size));
            fs.readSync(fd, readBuf, 0, readBuf.length, 0);
            fs.closeSync(fd);
            const headText = readBuf.toString('utf8');
            const userReqMatch = headText.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
            if (userReqMatch && userReqMatch[1]) {
                const firstLine = userReqMatch[1].trim().split('\n')[0].trim();
                if (firstLine)
                    title = firstLine.slice(0, 35);
            }
            const modelMatch = headText.match(/Model Selection` from \w+ to ([^.]+)\./);
            if (modelMatch && modelMatch[1]) {
                model = modelMatch[1].trim();
            }
        }
        catch { }
        const emoji = tokens >= 200000 ? '🔴' : tokens >= 150000 ? '🟠' : tokens >= 100000 ? '🟡' : '🟢';
        const recommendation = tokens >= 200000
            ? 'Handoff 작성 및 세션 분리 필수'
            : tokens >= 150000
                ? '세션 분리 권장'
                : '세션 정상 유지';
        return {
            id: latest.id,
            title,
            model,
            tokens,
            bytes: latest.stat.size,
            mtime: latest.stat.mtimeMs,
            emoji,
            color: COLORS[emoji],
            percent,
            recommendation,
        };
    }
    catch {
        return null;
    }
}
// --- Status Bar Items ---
let statusBarClaude;
let statusBarAgy;
let sideBarButton;
let webviewProvider;
function activate(context) {
    webviewProvider = new TokenRouterWebviewProvider();
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('token-router-panel', webviewProvider));
    sideBarButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    sideBarButton.command = 'token-router.showPanel';
    context.subscriptions.push(sideBarButton);
    // Status bar items
    statusBarAgy = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
    statusBarAgy.command = 'token-router.showPanel';
    context.subscriptions.push(statusBarAgy);
    statusBarClaude = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarClaude.command = 'token-router.showPanel';
    context.subscriptions.push(statusBarClaude);
    context.subscriptions.push(vscode.commands.registerCommand('token-router.showPanel', () => {
        vscode.commands.executeCommand('token-router-container.focus');
    }), vscode.window.tabGroups.onDidChangeTabs(() => update()), vscode.window.tabGroups.onDidChangeTabGroups(() => update()));
    update();
    const interval = setInterval(update, 1000);
    context.subscriptions.push({ dispose: () => clearInterval(interval) });
}
function update() {
    scanClaudeTranscripts();
    const { threshold, loop } = limits();
    const claudeTabs = openClaudeTabs().map((t) => statusForClaude(t, threshold, loop));
    const currentClaude = claudeTabs.find((t) => t.active) || claudeTabs[0];
    const agySession = scanAntigravitySession();
    // 1. Antigravity Status Bar Update
    if (agySession) {
        const agyIcon = agySession.emoji === '🟢' ? '$(sparkle)' : ICONS[agySession.emoji];
        statusBarAgy.text = `${agyIcon} AGY ${fmt(agySession.tokens)} (${agySession.percent}%)`;
        statusBarAgy.tooltip = `Antigravity Session: ${agySession.title}\n`
            + `Usage: ${fmt(agySession.tokens)} / 200k (${agySession.percent}%)\n`
            + `Model: ${agySession.model}\n`
            + `Status: ${agySession.recommendation}\n`
            + `ID: ${agySession.id}`;
        statusBarAgy.color = agySession.color;
        statusBarAgy.show();
    }
    else {
        statusBarAgy.hide();
    }
    // 2. Claude Status Bar Update
    if (currentClaude) {
        const icon = ICONS[currentClaude.emoji];
        const text = `${currentClaude.label}\n${fmt(currentClaude.context)} / ${fmt(currentClaude.loop)} (${currentClaude.percent}%)`;
        sideBarButton.text = icon;
        sideBarButton.tooltip = text;
        statusBarClaude.text = `${icon} Claude ${fmt(currentClaude.context)} (${currentClaude.percent}%)`;
        statusBarClaude.tooltip = `${text}\nModel: ${currentClaude.model || '-'}`;
        statusBarClaude.color = currentClaude.color;
        statusBarClaude.show();
    }
    else {
        statusBarClaude.hide();
        if (!agySession) {
            sideBarButton.text = '$(circle-slash)';
            sideBarButton.tooltip = '열린 AI 세션 없음';
        }
        else {
            sideBarButton.text = '$(sparkle)';
            sideBarButton.tooltip = `AGY: ${agySession.title} (${fmt(agySession.tokens)})`;
        }
    }
    sideBarButton.show();
    webviewProvider.post({ agySession, claudeTabs });
}
class TokenRouterWebviewProvider {
    constructor() {
        this.lastData = { agySession: null, claudeTabs: [] };
    }
    resolveWebviewView(webviewView) {
        this.view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = HTML;
        webviewView.onDidChangeVisibility(() => this.post(this.lastData));
        this.post(this.lastData);
    }
    post(data) {
        this.lastData = data;
        this.view?.webview.postMessage(data);
    }
}
const HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #e0e0e0; padding: 12px; }
  .section-title { font-size: 11px; text-transform: uppercase; color: #888; font-weight: bold; margin: 12px 0 6px 0; letter-spacing: 0.5px; }
  .card { background: #252526; border: 1px solid #3e3e42; border-radius: 8px; padding: 14px; margin-bottom: 10px; }
  .card.active { border-color: #4ec9b0; }
  .card.agy { border-left: 4px solid #38bdf8; }
  .head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .title { font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
  .badge { font-size: 10px; color: #38bdf8; border: 1px solid #38bdf8; border-radius: 4px; padding: 1px 5px; }
  .ctx { font-size: 22px; font-weight: bold; }
  .sub { font-size: 11px; color: #999; margin-top: 2px; }
  .bar { height: 6px; background: #333; border-radius: 3px; overflow: hidden; margin: 8px 0; }
  .fill { height: 100%; border-radius: 3px; transition: width 0.3s ease; }
</style>
</head>
<body>
  <div id="content"></div>
  <script>
    window.addEventListener('message', event => {
      const data = event.data;
      const { agySession, claudeTabs } = data;
      let html = '';

      if (agySession) {
        html += '<div class="section-title">Google Antigravity</div>';
        html += '<div class="card agy active">';
        html += '  <div class="head">';
        html += '    <span class="badge">ACTIVE</span>';
        html += '    <div class="title">' + agySession.title + '</div>';
        html += '    <span>' + agySession.emoji + '</span>';
        html += '  </div>';
        html += '  <div class="ctx" style="color:' + agySession.color + '">' + (agySession.tokens >= 1000 ? (agySession.tokens/1000).toFixed(1) + 'k' : agySession.tokens) + ' <span style="font-size:14px;color:#888;">/ 200k (' + agySession.percent + '%)</span></div>';
        html += '  <div class="bar"><div class="fill" style="width:' + agySession.percent + '%;background:' + agySession.color + '"></div></div>';
        html += '  <div class="sub">Model: ' + agySession.model + ' · ' + agySession.recommendation + '</div>';
        html += '</div>';
      }

      if (claudeTabs && claudeTabs.length > 0) {
        html += '<div class="section-title">Claude Code</div>';
        claudeTabs.forEach(t => {
          html += '<div class="card ' + (t.active ? 'active' : '') + '">';
          html += '  <div class="head">';
          if (t.active) html += '<span class="badge" style="color:#4ec9b0;border-color:#4ec9b0">CURRENT</span>';
          html += '    <div class="title">' + t.label + '</div>';
          html += '    <span>' + t.emoji + '</span>';
          html += '  </div>';
          html += '  <div class="ctx" style="color:' + t.color + '">' + (t.context >= 1000 ? (t.context/1000).toFixed(1) + 'k' : t.context) + ' <span style="font-size:14px;color:#888;">/ ' + (t.loop/1000).toFixed(0) + 'k (' + t.percent + '%)</span></div>';
          html += '  <div class="bar"><div class="fill" style="width:' + Math.min(100, t.percent) + '%;background:' + t.color + '"></div></div>';
          html += '  <div class="sub">Model: ' + (t.model || '-') + '</div>';
          html += '</div>';
        });
      }

      if (!agySession && (!claudeTabs || claudeTabs.length === 0)) {
        html = '<div style="color:#888;text-align:center;margin-top:20px;">열린 세션 없음</div>';
      }

      document.getElementById('content').innerHTML = html;
    });
  </script>
</body>
</html>`;
function deactivate() { }
