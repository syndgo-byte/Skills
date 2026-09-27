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
const codexUsage_1 = require("./codexUsage");
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
// --- Paths ---
const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const AGY_BRAIN_DIR = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
const CLAUDE_VIEW_TYPE = 'claudeVSCodePanel';
const SCAN_MAX_AGE = 7 * 24 * 3600 * 1000;
// Right-aligned items: higher priority = further left. jjju usage monitor is patched to 10005 (codex) / 10003 (claude).
const PRIORITY = { codex: 10006, claude: 10004, agy: 10002, agyTotal: 10001 };
const EXT_IDS = { codex: 'openai.chatgpt', claude: 'anthropic.claude-code', agy: 'google.google-antigravity' };
const installed = (id) => {
    // Try exact ID first, then with wildcard matching for versioned extensions
    if (vscode.extensions.getExtension(id))
        return true;
    return !!vscode.extensions.all.find(e => e.id.startsWith(id));
};
const CLAUDE_STATE_FILE = path.join(os.homedir(), '.claude', 'token-router', 'state.json');
const AGY_STATE_FILE = path.join(os.homedir(), '.gemini', 'antigravity', 'token-router', 'state.json');
function getAgyLimits() {
    let st = {};
    try {
        st = JSON.parse(fs.readFileSync(AGY_STATE_FILE, 'utf8'));
    }
    catch { }
    return { threshold: st.handoffTokens || 80000, loop: st.loopTokens || 200000 };
}
function getClaudeLimits() {
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
const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);
// --- Claude Scanner ---
const transcripts = new Map();
function updateClaudeTranscript(file, stat) {
    let t = transcripts.get(file);
    if (t && t.size === stat.size && t.mtime === stat.mtimeMs)
        return;
    if (!t) {
        t = { size: 0, mtime: 0, leftover: '', aiTitle: '', customTitle: '', context: 0, model: '' };
        transcripts.set(file, t);
    }
    try {
        const fd = fs.openSync(file, 'r');
        try {
            // 1. Read first 32KB to extract aiTitle and customTitle
            const headLen = Math.min(32768, stat.size);
            const headBuf = Buffer.alloc(headLen);
            fs.readSync(fd, headBuf, 0, headLen, 0);
            const headLines = headBuf.toString('utf8').split('\\n');
            for (const line of headLines) {
                if (!line)
                    continue;
                if (line.includes('aiTitle') || line.includes('customTitle')) {
                    try {
                        const e = JSON.parse(line);
                        if (e.type === 'ai-title' && e.aiTitle)
                            t.aiTitle = e.aiTitle;
                        else if (e.type === 'custom-title' && e.customTitle)
                            t.customTitle = e.customTitle;
                    }
                    catch { }
                }
            }
            // 2. Read last 65536 bytes to extract latest context usage, model, and compact boundary
            const tailLen = Math.min(65536, stat.size);
            const tailOffset = Math.max(0, stat.size - tailLen);
            const tailBuf = Buffer.alloc(tailLen);
            fs.readSync(fd, tailBuf, 0, tailLen, tailOffset);
            const tailLines = tailBuf.toString('utf8').split('\\n');
            for (const line of tailLines) {
                if (!line)
                    continue;
                if (line.includes('compact_boundary')) {
                    t.context = 0;
                }
                else if (line.includes('"usage"')) {
                    try {
                        const e = JSON.parse(line);
                        if (e.type === 'assistant' && e.message?.usage) {
                            const u = e.message.usage;
                            t.context = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
                            t.model = e.message.model || t.model;
                        }
                    }
                    catch { }
                }
            }
        }
        finally {
            fs.closeSync(fd);
        }
    }
    catch { }
    t.size = stat.size;
    t.mtime = stat.mtimeMs;
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
    const candidates = [];
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
                if (now - stat.mtimeMs <= SCAN_MAX_AGE) {
                    candidates.push({ file: full, stat });
                }
            }
            catch { }
        }
    }
    // Sort descending by mtime and scan only the top 15 most recent files
    candidates.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    const topCandidates = candidates.slice(0, 15);
    for (const item of topCandidates) {
        updateClaudeTranscript(item.file, item.stat);
    }
    // 혹시 아무것도 스캔되지 않으면 가장 최근 파일 강제 로드
    if (transcripts.size === 0 && candidates.length > 0) {
        const latest = candidates[0];
        updateClaudeTranscript(latest.file, latest.stat);
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
    // 정확한 매칭 먼저 시도
    for (const t of transcripts.values()) {
        const title = (t.customTitle || t.aiTitle).trim();
        if (!title)
            continue;
        if (title === label) {
            best = t;
            break;
        }
    }
    // 부분 매칭
    if (!best) {
        for (const t of transcripts.values()) {
            const title = (t.customTitle || t.aiTitle).trim();
            if (!title)
                continue;
            const hit = (isCut && title.startsWith(cut)) || (cut && title.includes(cut.slice(0, 20)));
            if (hit && (!best || t.mtime > best.mtime))
                best = t;
        }
    }
    // 여전히 못 찾으면 가장 최근 항목 사용
    if (!best && transcripts.size > 0) {
        best = Array.from(transcripts.values()).sort((a, b) => b.mtime - a.mtime)[0];
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
    const limits = getAgyLimits();
    try {
        if (!fs.existsSync(AGY_BRAIN_DIR)) {
            return fallbackAgySession(limits);
        }
        const dirs = fs.readdirSync(AGY_BRAIN_DIR);
        let latest = null;
        let totalBytes = 0;
        let recentBytes = 0;
        let oldestRecentMtime = Date.now(); // 최근 5시간 내 가장 오래된 파일의 mtime
        const fiveHoursAgo = Date.now() - 5 * 3600 * 1000;
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
                totalBytes += stat.size;
                if (stat.mtimeMs >= fiveHoursAgo) {
                    recentBytes += stat.size;
                    if (stat.mtimeMs < oldestRecentMtime) {
                        oldestRecentMtime = stat.mtimeMs;
                    }
                }
                if (!latest || stat.mtimeMs > latest.stat.mtimeMs) {
                    latest = { id: d, file: targetFile, stat };
                }
            }
            catch { }
        }
        if (!latest)
            return fallbackAgySession(limits);
        // Heuristic: ~3.8 bytes per token in mixed Korean/English code JSON logs
        const tokens = Math.round(latest.stat.size / 3.8);
        const totalTokens = Math.round(totalBytes / 3.8);
        const recentTokens = Math.round(recentBytes / 3.8);
        // AGY 5h 리밋: 5,000,000 토큰으로 설정
        const agyFiveHourLimit = 5000000;
        const agyFiveHourPercent = Math.min(100, Math.round((recentTokens / agyFiveHourLimit) * 100));
        // 카운트다운: (가장 오래된 파일 mtime + 5시간) - 현재시간
        const agyFiveHourResetMs = oldestRecentMtime + 5 * 3600 * 1000;
        const timeLeftMs = Math.max(0, agyFiveHourResetMs - Date.now());
        const resetTime = Math.round(timeLeftMs / 1000);
        const maxTokens = limits.loop;
        const percent = Math.min(100, Math.round((tokens / maxTokens) * 100));
        let title = `세션 ${latest.id.slice(0, 8)}`;
        let model = 'Gemini 3.8 Flash';
        try {
            const fd = fs.openSync(latest.file, 'r');
            const readBuf = Buffer.alloc(Math.min(8192, latest.stat.size));
            fs.readSync(fd, readBuf, 0, readBuf.length, 0);
            fs.closeSync(fd);
            const headText = readBuf.toString('utf8');
            const userReqMatch = headText.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
            if (userReqMatch && userReqMatch[1]) {
                const firstLine = userReqMatch[1].trim().split('\
')[0].trim();
                if (firstLine)
                    title = firstLine.slice(0, 30);
            }
            const modelMatches = [...headText.matchAll(/Model Selection` from [^\s]+ to ([^.]+)\./g)];
            if (modelMatches.length > 0) {
                model = modelMatches[modelMatches.length - 1][1].trim();
            }
        }
        catch { }
        const emoji = tokens >= limits.loop ? '🔴' : tokens >= limits.threshold ? '🟠' : tokens >= limits.threshold * 0.8 ? '🟡' : '🟢';
        const recommendation = tokens >= limits.loop
            ? 'Handoff 필수 (새 세션 시작)'
            : tokens >= limits.threshold
                ? '세션 분리 권장'
                : '세션 유지 (정상)';
        return {
            id: latest.id,
            title,
            model,
            tokens,
            recentTokens,
            resetTime,
            bytes: latest.stat.size,
            mtime: latest.stat.mtimeMs,
            emoji,
            color: COLORS[emoji],
            percent,
            recommendation,
            agyFiveHourPercent,
            agyFiveHourResetMs,
        };
    }
    catch {
        return fallbackAgySession(limits);
    }
}
function fallbackAgySession(limits) {
    const now = Date.now();
    return {
        id: 'active',
        title: 'Antigravity Session',
        model: 'Gemini 3.8 Flash',
        tokens: 0,
        recentTokens: 0,
        resetTime: 0,
        bytes: 0,
        mtime: now,
        emoji: '🟢',
        color: '#22c55e',
        percent: 0,
        recommendation: '대화 시작 대기 중',
        agyFiveHourPercent: 0,
        agyFiveHourResetMs: now + 5 * 3600 * 1000,
    };
}
// --- Status Bar Items ---
let statusBarCodex;
let statusBarClaude;
let statusBarAgy;
let statusBarAgyTotal;
let sideBarButton;
let webviewProvider;
function activate(context) {
    statusBarCodex = vscode.window.createStatusBarItem('tokenRouter.codex', vscode.StatusBarAlignment.Right, PRIORITY.codex);
    statusBarCodex.name = 'Codex Context Usage';
    statusBarCodex.command = 'token-router.showPanel';
    context.subscriptions.push(statusBarCodex);
    webviewProvider = new TokenRouterWebviewProvider();
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('token-router-panel', webviewProvider));
    sideBarButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    sideBarButton.command = 'token-router.showPanel';
    context.subscriptions.push(sideBarButton);
    statusBarAgy = vscode.window.createStatusBarItem('tokenRouter.agy', vscode.StatusBarAlignment.Right, PRIORITY.agy);
    statusBarAgy.name = 'Antigravity Usage';
    statusBarAgy.command = 'token-router.showPanel';
    context.subscriptions.push(statusBarAgy);
    statusBarAgyTotal = vscode.window.createStatusBarItem('tokenRouter.agyTotal', vscode.StatusBarAlignment.Right, PRIORITY.agyTotal);
    statusBarAgyTotal.name = 'Antigravity 5h Total';
    statusBarAgyTotal.command = 'token-router.showPanel';
    context.subscriptions.push(statusBarAgyTotal);
    statusBarClaude = vscode.window.createStatusBarItem('tokenRouter.claude', vscode.StatusBarAlignment.Right, PRIORITY.claude);
    statusBarClaude.name = 'Claude Code Usage';
    statusBarClaude.command = 'token-router.showPanel';
    context.subscriptions.push(statusBarClaude);
    context.subscriptions.push(vscode.commands.registerCommand('token-router.showPanel', () => {
        vscode.commands.executeCommand('token-router-container.focus');
    }), vscode.window.tabGroups.onDidChangeTabs(() => update()), vscode.window.tabGroups.onDidChangeTabGroups(() => update()), vscode.extensions.onDidChange(() => update()));
    setTimeout(update, 200);
    const interval = setInterval(update, 1000);
    context.subscriptions.push({ dispose: () => clearInterval(interval) });
}
function update() {
    const hasCodex = installed(EXT_IDS.codex);
    const hasClaude = installed(EXT_IDS.claude);
    const hasAgy = installed(EXT_IDS.agy);
    const codexSession = hasCodex ? (0, codexUsage_1.readCodexUsage)() : null;
    if (hasCodex) {
        statusBarCodex.text = codexSession ? '$(hubot) Codex ' + fmt(codexSession.context_tokens || 0) + ' (' + (codexSession.context_percent ?? '?') + '%)' + (codexSession.stale ? ' [오래됨]' : '') : '$(hubot) Codex 데이터 대기';
        statusBarCodex.tooltip = codexSession ? (codexSession.model || '?') + ' / ' + (codexSession.effort || '?') + '\n마지막 입력 토큰 / 컨텍스트 한도: ' + codexSession.context_tokens + ' / ' + codexSession.context_window + '\n최근 기록 세션: ' + codexSession.id : 'D:/Skills/usage/codex/usage.json';
        statusBarCodex.color = codexSession?.stale ? '#999999' : '#4ec9b0';
        statusBarCodex.show();
    }
    else {
        statusBarCodex.hide();
    }
    let claudeTabs = [];
    if (hasClaude) {
        scanClaudeTranscripts();
        const claudeLimits = getClaudeLimits();
        claudeTabs = openClaudeTabs().map((t) => statusForClaude(t, claudeLimits.threshold, claudeLimits.loop));
    }
    const currentClaude = claudeTabs.find((t) => t.active) || claudeTabs[0];
    const agySession = hasAgy ? scanAntigravitySession() : null;
    if (!agySession) {
        statusBarAgy.hide();
        statusBarAgyTotal.hide();
    }
    else {
        updateAgyItems(agySession);
    }
    if (currentClaude) {
        const icon = ICONS[currentClaude.emoji];
        const text = `${currentClaude.label}
${fmt(currentClaude.context)} / ${fmt(currentClaude.loop)} (${currentClaude.percent}%)`;
        sideBarButton.text = '$(graph)'; // bar graph icon
        sideBarButton.tooltip = text;
        statusBarClaude.text = `${icon} Claude ${fmt(currentClaude.context)} (${currentClaude.percent}%)`;
        statusBarClaude.tooltip = `${text}
Model: ${currentClaude.model || '-'}`;
        statusBarClaude.color = currentClaude.color;
        statusBarClaude.show();
        sideBarButton.show();
    }
    else if (hasClaude) {
        // Claude가 설치되어 있으면 "데이터 로드 중" 표시
        statusBarClaude.text = '$(graph) Claude 데이터 로드 중...';
        statusBarClaude.tooltip = 'Claude Code 탭을 열고 메시지를 보내면 데이터가 업데이트됩니다.';
        statusBarClaude.color = '#999999';
        statusBarClaude.show();
        sideBarButton.hide();
    }
    else {
        statusBarClaude.hide();
        if (agySession) {
            sideBarButton.text = '$(triangle-up)';
            sideBarButton.tooltip = `Antigravity: ${agySession.title} (${fmt(agySession.tokens)})`;
            sideBarButton.show();
        }
        else {
            sideBarButton.hide();
        }
    }
    // Token Usage 패널에 데이터 전송
    webviewProvider.post({ agySession, claudeTabs, codexSession });
}
function updateAgyItems(agySession) {
    const agyIcon = '$(triangle-up)';
    const pct = agySession.agyFiveHourPercent ?? 0;
    // 카운트다운 포맷팅: 시간:분 형식
    const timeLeftMs = Math.max(0, (agySession.agyFiveHourResetMs ?? 0) - Date.now());
    const hours = Math.floor(timeLeftMs / 3600000);
    const minutes = Math.floor((timeLeftMs % 3600000) / 60000);
    const timeLeftStr = `${hours}h ${minutes}m`;
    statusBarAgyTotal.text = `${agyIcon} AGY 5h ${pct}% (${timeLeftStr})`;
    statusBarAgyTotal.tooltip = '최근 5시간 동안 수정된 Antigravity 세션 로그 합계 (추정: 바이트 / 3.8)';
    statusBarAgyTotal.color = '#999999'; // 회색 (Codex/Claude 5h와 동일)
    statusBarAgyTotal.show();
    statusBarAgy.text = `${agyIcon} AGY ${fmt(agySession.tokens)} (${agySession.percent}%)`;
    statusBarAgy.tooltip = new vscode.MarkdownString(`### Google Antigravity Usage

`
        + `* **세션**: ${agySession.title}
`
        + `* **토큰 사용량**: **${fmt(agySession.tokens)}** / 200k (${agySession.percent}%)
`
        + `* **모델**: ${agySession.model}
`
        + `* **상태**: ${agySession.recommendation}
`
        + `* **세션 ID**: \`${agySession.id}\`

`
        + `*클릭하여 토큰 라우터 패널 열기*`);
    statusBarAgy.color = agySession.color;
    statusBarAgy.show();
}
class TokenRouterWebviewProvider {
    constructor() {
        this.lastData = { agySession: null, claudeTabs: [], codexSession: null };
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
      const esc = v => String(v == null ? '?' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      const cx = data.codexSession;
      html += '<div class="section-title">Codex</div><div class="card">';
      if (cx) {
        html += '<div class="head"><div class="title">' + esc(cx.model) + ' / ' + esc(cx.effort) + '</div></div>';
        html += '<div class="ctx" style="color:#4ec9b0">' + (cx.context_tokens / 1000).toFixed(1) + 'k <span style="font-size:14px;color:#888">/ ' + (cx.context_window == null ? '?' : (cx.context_window / 1000).toFixed(1) + 'k') + ' (' + esc(cx.context_percent) + '%)</span></div>';
        html += '<div class="bar"><div class="fill" style="background:#4ec9b0;width:' + Math.max(0, Math.min(100, Number(cx.context_percent) || 0)) + '%"></div></div>';
        html += '<div class="sub">마지막 입력 토큰 · 최근 기록 세션' + (cx.stale ? ' · 수집 데이터 오래됨' : '') + '</div>';
        html += '<div class="sub">' + esc(cx.id) + '</div>';
      } else { html += '<div class="sub">Codex 사용량 데이터 대기</div>'; }
      html += '</div>';

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
        html += '<div style="color:#888;text-align:center;margin-top:20px;">열린 세션 없음</div>';
      }

      document.getElementById('content').innerHTML = html;
    });
  </script>
</body>
</html>`;
function deactivate() { }
