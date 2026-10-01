import { readCodexUsage, CodexUsage } from './codexUsage';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';
import { execFile } from 'child_process';

// --- Paths ---
const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const AGY_BRAIN_DIR = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
const CLAUDE_VIEW_TYPE = 'claudeVSCodePanel';
const SCAN_MAX_AGE = 7 * 24 * 3600 * 1000;

// Right-aligned items: higher priority = further left. jjju usage monitor is patched to 10005 (codex) / 10003 (claude).
const PRIORITY = { codex: 10006, claude: 10004, agy: 10002, agyTotal: 10001 };
const EXT_IDS = { codex: 'openai.chatgpt', claude: 'anthropic.claude-code', agy: 'google.google-antigravity' };
const installed = (id: string) => !!vscode.extensions.getExtension(id);

const CLAUDE_STATE_FILE = path.join(os.homedir(), '.claude', 'token-router', 'state.json');
const AGY_STATE_FILE = path.join(os.homedir(), '.gemini', 'antigravity', 'token-router', 'state.json');

function getAgyLimits(): { threshold: number; loop: number } {
  let st: any = {};
  try { st = JSON.parse(fs.readFileSync(AGY_STATE_FILE, 'utf8')); } catch { }
  return { threshold: st.handoffTokens || 80000, loop: st.loopTokens || 200000 };
}

function getClaudeLimits(): { threshold: number; loop: number } {
  let st: any = {};
  try { st = JSON.parse(fs.readFileSync(CLAUDE_STATE_FILE, 'utf8')); } catch { }
  return { threshold: st.handoffTokens || 80000, loop: st.loopTokens || 200000 };
}

// --- Interfaces ---
interface Transcript {
  size: number;
  mtime: number;
  leftover: string;
  aiTitle: string;
  customTitle: string;
  context: number;
  model: string;
}

interface TabStatus {
  source: 'claude' | 'antigravity';
  label: string;
  active: boolean;
  matched: boolean;
  context: number;
  model: string;
  emoji: string;
  color: string;
  percent: number;
  loop: number;
  atLoop: boolean;
}

interface AntigravitySession {
  id: string;
  title: string;
  model: string;
  tokens: number;
  recentTokens: number;
  resetTime: number;
  bytes: number;
  mtime: number;
  emoji: string;
  color: string;
  percent: number;
  recommendation: string;
  agyFiveHourPercent?: number;
  agyFiveHourResetMs?: number;
}

const COLORS: { [emoji: string]: string } = {
  '🟢': '#22c55e',
  '🟡': '#eab308',
  '🟠': '#f97316',
  '🔴': '#ef4444',
};

const ICONS: { [emoji: string]: string } = {
  '🟢': '$(circle-filled)',
  '🟡': '$(warning)',
  '🟠': '$(circle-outline)',
  '🔴': '$(error)',
};

const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);

// --- Claude Scanner ---
const transcripts = new Map<string, Transcript>();

function updateClaudeTranscript(file: string, stat: fs.Stats) {
  let t = transcripts.get(file);
  if (t && t.size === stat.size && t.mtime === stat.mtimeMs) return;
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
      const headLines = headBuf.toString('utf8').split('\n');
      for (const line of headLines) {
        if (!line) continue;
        if (line.includes('aiTitle') || line.includes('customTitle')) {
          try {
            const e = JSON.parse(line);
            if (e.type === 'ai-title' && e.aiTitle) t.aiTitle = e.aiTitle;
            else if (e.type === 'custom-title' && e.customTitle) t.customTitle = e.customTitle;
          } catch { }
        }
      }

      // 2. Read the tail for the latest usage, model and compact boundary. Pasted screenshots make
      // single lines hundreds of KB, so widen the window until an answer's usage line shows up.
      let tailLines: string[] = [];
      for (const want of [65536, 1 << 20, 8 << 20]) {
        const tailLen = Math.min(want, stat.size);
        const tailBuf = Buffer.alloc(tailLen);
        fs.readSync(fd, tailBuf, 0, tailLen, stat.size - tailLen);
        tailLines = tailBuf.toString('utf8').split('\n');
        if (tailLen === stat.size || tailLines.some((l) => l.includes('"usage"') && l.includes('"assistant"'))) break;
      }
      for (const line of tailLines) {
        if (!line) continue;
        if (line.includes('"compact_boundary"')) {
          // Only a real system entry counts; tool output that merely mentions the word does not.
          try {
            const e = JSON.parse(line);
            if (e.type === 'system' && e.subtype === 'compact_boundary') t.context = 0;
          } catch { }
        } else if (line.includes('"ai-title"') || line.includes('"custom-title"')) {
          // Titles are re-appended through the session, so long transcripts only have them near the end.
          try {
            const e = JSON.parse(line);
            if (e.type === 'ai-title' && e.aiTitle) t.aiTitle = e.aiTitle;
            else if (e.type === 'custom-title' && e.customTitle) t.customTitle = e.customTitle;
          } catch { }
        } else if (line.includes('"usage"')) {
          try {
            const e = JSON.parse(line);
            if (e.type === 'assistant' && e.message?.usage) {
              const u = e.message.usage;
              t.context = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
              t.model = e.message.model || t.model;
            }
          } catch { }
        }
      }
    } finally {
      fs.closeSync(fd);
    }
  } catch { }

  t.size = stat.size;
  t.mtime = stat.mtimeMs;
}

function scanClaudeTranscripts() {
  const now = Date.now();
  let dirs: string[] = [];
  try { dirs = fs.readdirSync(CLAUDE_PROJECTS_DIR); } catch {
    // Don't clear cache on error — keep previous values even if CLAUDE_PROJECTS_DIR inaccessible
    return;
  }

  const candidates: { file: string; stat: fs.Stats }[] = [];
  for (const d of dirs) {
    const dir = path.join(CLAUDE_PROJECTS_DIR, d);
    let files: string[] = [];
    try { files = fs.readdirSync(dir); } catch { continue; }
    for (const f of files) {
      if (!f.endsWith('.jsonl')) continue;
      const full = path.join(dir, f);
      try {
        const stat = fs.statSync(full);
        if (now - stat.mtimeMs <= SCAN_MAX_AGE) {
          candidates.push({ file: full, stat });
        }
      } catch { }
    }
  }

  // Only update found files; don't clear cache if no candidates found
  if (candidates.length === 0) return;

  // All recent files, not just the newest few: tabs restored in another folder can be days old.
  // Unchanged files are skipped by the size/mtime check, so this is cheap after the first pass.
  for (const item of candidates) {
    updateClaudeTranscript(item.file, item.stat);
  }
}

function openClaudeTabs(): { label: string; active: boolean }[] {
  const tabs: { label: string; active: boolean }[] = [];
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

// Fallback: when tab matching fails, read the most recent session file directly.
function findMostRecentClaudeSession(): TabStatus | undefined {
  const loop = getClaudeLimits().loop;
  const threshold = getClaudeLimits().threshold;
  let recent: { file: string; mtime: number; context: number; model: string } | null = null;
  try {
    const dirs = fs.readdirSync(CLAUDE_PROJECTS_DIR);
    for (const d of dirs) {
      const dir = path.join(CLAUDE_PROJECTS_DIR, d);
      let files: string[] = [];
      try { files = fs.readdirSync(dir); } catch { continue; }
      for (const f of files) {
        if (!f.endsWith('.jsonl') || f.startsWith('subagents')) continue;
        const full = path.join(dir, f);
        try {
          const stat = fs.statSync(full);
          if (!recent || stat.mtimeMs > recent.mtime) {
            // Read file directly every time (not from cache) for real-time data
            const context = readLastContextFromJsonl(full);
            const model = readLastModelFromJsonl(full);
            if (context !== null) {
              recent = { file: full, mtime: stat.mtimeMs, context, model };
            }
          }
        } catch { }
      }
    }
  } catch { }

  if (!recent) return undefined;
  return {
    source: 'claude',
    label: '(recent session)',
    active: true,
    matched: true,
    context: recent.context,
    model: recent.model,
    emoji: recent.context >= loop ? '🔴' : recent.context >= threshold ? '🟠' : recent.context >= threshold * 0.875 ? '🟡' : '🟢',
    color: COLORS[recent.context >= loop ? '🔴' : recent.context >= threshold ? '🟠' : recent.context >= threshold * 0.875 ? '🟡' : '🟢'],
    percent: Math.round((recent.context / loop) * 100),
    loop,
    atLoop: recent.context >= loop,
  };
}

// Read the last few lines of a .jsonl file to extract context (real-time)
function readLastContextFromJsonl(file: string): number | null {
  try {
    const stat = fs.statSync(file);
    if (stat.size === 0) return null;
    const fd = fs.openSync(file, 'r');
    const bufSize = Math.min(16384, stat.size);
    const buf = Buffer.alloc(bufSize);
    fs.readSync(fd, buf, 0, bufSize, Math.max(0, stat.size - bufSize));
    fs.closeSync(fd);
    const text = buf.toString('utf8');
    const lines = text.split(/[\r\n]+/).filter(l => l.trim());
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const rec = JSON.parse(lines[i]);
        if (rec.context !== undefined && typeof rec.context === 'number') {
          return rec.context;
        }
      } catch { }
    }
  } catch { }
  return null;
}

// Read the last few lines of a .jsonl file to extract model (real-time)
function readLastModelFromJsonl(file: string): string {
  try {
    const stat = fs.statSync(file);
    if (stat.size === 0) return '';
    const fd = fs.openSync(file, 'r');
    const bufSize = Math.min(16384, stat.size);
    const buf = Buffer.alloc(bufSize);
    fs.readSync(fd, buf, 0, bufSize, Math.max(0, stat.size - bufSize));
    fs.closeSync(fd);
    const text = buf.toString('utf8');
    const lines = text.split(/[\r\n]+/).filter(l => l.trim());
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const rec = JSON.parse(lines[i]);
        if (rec.model && typeof rec.model === 'string') {
          return rec.model;
        }
      } catch { }
    }
  } catch { }
  return '';
}

function statusForClaude(tab: { label: string; active: boolean }, threshold: number, loop: number): TabStatus {
  const label = tab.label.trim();
  const cut = label.replace(/(\.\.\.|…)$/, '').trim();
  const isCut = cut !== label;
  let best: Transcript | undefined;
  for (const t of transcripts.values()) {
    const title = (t.customTitle || t.aiTitle).trim();
    if (!title) continue;
    const hit = title === label || (isCut && title.startsWith(cut));
    if (hit && (!best || t.mtime > best.mtime)) best = t;
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
function scanAntigravitySession(): AntigravitySession {
  const limits = getAgyLimits();
  try {
    if (!fs.existsSync(AGY_BRAIN_DIR)) {
      return fallbackAgySession(limits);
    }
    const dirs = fs.readdirSync(AGY_BRAIN_DIR);
    let latest: { id: string; file: string; stat: fs.Stats } | null = null;
    let totalBytes = 0;
    let recentBytes = 0;
    let oldestRecentMtime = Date.now(); // 최근 5시간 내 가장 오래된 파일의 mtime
    const fiveHoursAgo = Date.now() - 5 * 3600 * 1000;

    for (const d of dirs) {
      if (d === 'tempmediaStorage') continue;
      const logDir = path.join(AGY_BRAIN_DIR, d, '.system_generated', 'logs');
      const candidateFull = path.join(logDir, 'transcript_full.jsonl');
      const candidateNorm = path.join(logDir, 'transcript.jsonl');
      const targetFile = fs.existsSync(candidateFull) ? candidateFull : (fs.existsSync(candidateNorm) ? candidateNorm : null);
      if (!targetFile) continue;

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
      } catch { }
    }

    if (!latest) return fallbackAgySession(limits);

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
        const firstLine = userReqMatch[1].trim().split('\n')[0].trim();
        if (firstLine) title = firstLine.slice(0, 30);
      }
      const modelMatches = [...headText.matchAll(/Model Selection` from [^\s]+ to ([^.]+)\./g)];
      if (modelMatches.length > 0) {
        model = modelMatches[modelMatches.length - 1][1].trim();
      }
    } catch { }

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
  } catch {
    return fallbackAgySession(limits);
  }
}

function fallbackAgySession(limits: { threshold: number; loop: number }): AntigravitySession {
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

// --- Antigravity real quota (local agy.exe hub, same source as the "View Usage" popup) ---
interface AgyQuotaGroup { models: string[]; remaining: number; resetMs: number }
interface AgyQuotaWindow { group: string; window: string; usedPct: number; resetMs: number }
interface AgyQuota { usedPct: number; resetMs: number; groups: AgyQuotaGroup[]; windows: AgyQuotaWindow[]; at: number }
let agyQuota: AgyQuota | null = null;
let agyConn: { port: number; token: string } | null = null;
let agyQuotaBusy = false;
let agyPlan = '';

// First text value under a plan / tier key in GetUserStatus (the field has moved between agy versions).
function planName(o: any, depth = 0): string {
  if (!o || typeof o !== 'object' || depth > 4) return '';
  for (const [k, v] of Object.entries(o)) {
    if (!/plan|tier/i.test(k)) continue;
    const s = typeof v === 'string' ? v : planName(v, depth + 1);
    if (s) return s;
  }
  for (const v of Object.values(o)) {
    const s = planName(v, depth + 1);
    if (s) return s;
  }
  return '';
}

// Snapshot for other local apps (MCP Hub's AI tool panel). Usage numbers only, never credentials.
const AI_STATUS_FILE = 'D:/Skills/usage/ai-status.json';
function writeAiStatus(agySession: AntigravitySession | null, claude: TabStatus | undefined, codex: CodexUsage | null) {
  const snap = {
    updated_at: new Date().toISOString(),
    antigravity: agySession
      ? { plan: agyPlan || null, plan_label: agyTier.label, credits: agyTier.credits, quota: agyQuota ? { usedPct: agyQuota.usedPct, resetMs: agyQuota.resetMs, groups: agyQuota.groups, windows: agyQuota.windows } : null, error: agyQuotaErr || null }
      : null,
    claude: claude ? { model: claude.model || null, context: claude.context, loop: claude.loop, percent: claude.percent } : null,
    codex: codex ? { model: codex.model || null, context_tokens: codex.context_tokens, context_window: codex.context_window, context_percent: codex.context_percent, stale: !!codex.stale } : null,
  };
  try {
    fs.mkdirSync(path.dirname(AI_STATUS_FILE), { recursive: true });
    fs.writeFileSync(AI_STATUS_FILE + '.tmp', JSON.stringify(snap, null, 2));
    fs.renameSync(AI_STATUS_FILE + '.tmp', AI_STATUS_FILE);
  } catch {
    // the status bar keeps working without the snapshot
  }
}
let agyQuotaTry = Date.now() - 70000; // 초기 60초 지난 것처럼 설정해서 첫 update()에서 즉시 호출
let agyTier: { label: string | null; credits: { prompt: number; flow: number } | null } = { label: null, credits: null };
let agyQuotaErr = '아직 조회 전';

function findAgyConn(): Promise<{ port: number; token: string } | null> {
  const args = ['-NoProfile', '-NonInteractive', '-Command', "(Get-CimInstance Win32_Process -Filter \"Name='agy.exe'\").CommandLine"];
  return new Promise((res) => execFile('powershell.exe', args, { windowsHide: true, timeout: 8000 }, (_err, out) => {
    const token = out?.match(/--csrf_token[= ](\S+)/)?.[1];
    const port = out?.match(/--hub-port[= ](\d+)/)?.[1];
    res(token && port ? { port: Number(port), token } : null);
  }));
}

const postUserStatus = (c: { port: number; token: string }) => postAgy(c, 'GetUserStatus');

function postAgy(c: { port: number; token: string }, method: string): Promise<any> {
  const body = JSON.stringify({ metadata: { ideName: 'antigravity', extensionName: 'antigravity', locale: 'en' } });
  return new Promise((res) => {
    const r = http.request({
      host: '127.0.0.1', port: c.port, method: 'POST', timeout: 3000,
      path: `/exa.language_server_pb.LanguageServerService/${method}`,
      headers: { 'Content-Type': 'application/json', 'Connect-Protocol-Version': '1', 'X-Codeium-Csrf-Token': c.token, 'Content-Length': Buffer.byteLength(body) },
    }, (rs) => {
      let d = '';
      rs.on('data', (x) => (d += x));
      rs.on('end', () => { try { res(rs.statusCode === 200 ? JSON.parse(d) : null); } catch { res(null); } });
    });
    r.on('error', () => res(null));
    r.on('timeout', () => r.destroy());
    r.end(body);
  });
}

async function refreshAgyQuota() {
  if (agyQuotaBusy) return;
  agyQuotaBusy = true;
  agyQuotaTry = Date.now();
  try {
    let j = agyConn ? await postUserStatus(agyConn) : null;
    if (!j) {
      agyConn = await findAgyConn();
      if (!agyConn) { agyQuotaErr = 'agy.exe 프로세스/포트를 찾지 못함'; return; }
      j = await postUserStatus(agyConn);
      if (!j) { agyQuotaErr = `GetUserStatus 응답 없음 (port ${agyConn.port})`; return; }
    }
    const cfgs: any[] = j?.userStatus?.cascadeModelConfigData?.clientModelConfigs || [];
    const groups = new Map<string, AgyQuotaGroup>();
    for (const c of cfgs) {
      const q = c.quotaInfo;
      if (!q || typeof q.remainingFraction !== 'number') continue;
      const key = `${q.remainingFraction}|${q.resetTime}`;
      const g = groups.get(key) || { models: [] as string[], remaining: q.remainingFraction, resetMs: Date.parse(q.resetTime) || 0 };
      g.models.push(c.label);
      groups.set(key, g);
    }
    const list = [...groups.values()].sort((a, b) => a.remaining - b.remaining);
    if (!list.length) { agyQuotaErr = '응답에 quotaInfo 없음'; return; }
    agyQuotaErr = '';
    agyPlan = planName(j?.userStatus) || agyPlan;
    const ps = j?.userStatus?.planStatus;
    agyTier = {
      label: j?.userStatus?.userTier?.description || agyTier.label,
      credits: ps && typeof ps.availablePromptCredits === 'number' ? { prompt: ps.availablePromptCredits, flow: ps.availableFlowCredits ?? 0 } : agyTier.credits,
    };
    // 5-hour and weekly buckets per model group ("View Usage" popup source).
    const summary = agyConn ? await postAgy(agyConn, 'RetrieveUserQuotaSummary') : null;
    const windows: AgyQuotaWindow[] = [];
    if (!summary) agyQuotaErr = `RetrieveUserQuotaSummary 응답 없음`;
    for (const g of summary?.response?.groups || []) {
      const group = /claude|gpt/i.test(g.displayName || '') ? 'Claude·GPT' : /gemini/i.test(g.displayName || '') ? 'Gemini' : (g.displayName || '');
      for (const b of g.buckets || []) {
        if (typeof b.remainingFraction !== 'number') continue;
        windows.push({ group, window: b.window, usedPct: Math.round((1 - b.remainingFraction) * 100), resetMs: Date.parse(b.resetTime) || 0 });
      }
    }
    agyQuota = { usedPct: Math.round((1 - list[0].remaining) * 100), resetMs: list[0].resetMs, groups: list, windows, at: Date.now() };
  } catch (e: any) {
    agyQuotaErr = '예외: ' + (e?.message || e);
  } finally {
    agyQuotaBusy = false;
  }
}

const fmtLeft = (ms: number) => {
  const t = Math.max(0, ms - Date.now());
  return `${Math.floor(t / 3600000)}h ${Math.floor((t % 3600000) / 60000)}m`;
};

// --- Status Bar Items ---
let statusBarCodex: vscode.StatusBarItem;
let statusBarClaude: vscode.StatusBarItem;
let statusBarAgy: vscode.StatusBarItem;
let statusBarAgyTotal: vscode.StatusBarItem;
let sideBarButton: vscode.StatusBarItem;
let webviewProvider: TokenRouterWebviewProvider;

export function activate(context: vscode.ExtensionContext) {
  statusBarCodex = vscode.window.createStatusBarItem('tokenRouter.codex', vscode.StatusBarAlignment.Right, PRIORITY.codex);
  statusBarCodex.name = 'Codex Context Usage';
  statusBarCodex.command = 'token-router.showPanel';
  context.subscriptions.push(statusBarCodex);
  webviewProvider = new TokenRouterWebviewProvider();
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('token-router-panel', webviewProvider)
  );

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

  context.subscriptions.push(
    vscode.commands.registerCommand('token-router.showPanel', () => {
      vscode.commands.executeCommand('token-router-container.focus');
    }),
    vscode.window.tabGroups.onDidChangeTabs(() => update()),
    vscode.window.tabGroups.onDidChangeTabGroups(() => update()),
    vscode.extensions.onDidChange(() => update()),
  );

  setTimeout(update, 200);
  const interval = setInterval(update, 1000);
  context.subscriptions.push({ dispose: () => clearInterval(interval) });
}

function update() {
  const hasCodex = installed(EXT_IDS.codex);
  const hasClaude = installed(EXT_IDS.claude);
  const hasAgy = installed(EXT_IDS.agy);

  const codexSession = hasCodex ? readCodexUsage() : null;
  if (hasCodex) {
    statusBarCodex.text = codexSession ? '$(hubot) Codex ' + fmt(codexSession.context_tokens || 0) + ' (' + (codexSession.context_percent ?? '?') + '%)' + (codexSession.stale ? ' [오래됨]' : '') : '$(hubot) Codex 데이터 대기';
    statusBarCodex.tooltip = codexSession ? (codexSession.model || '?') + ' / ' + (codexSession.effort || '?') + '\n마지막 입력 토큰 / 컨텍스트 한도: ' + codexSession.context_tokens + ' / ' + codexSession.context_window + '\n최근 기록 세션: ' + codexSession.id : 'D:/Skills/usage/codex/usage.json';
    statusBarCodex.color = codexSession?.stale ? '#999999' : '#4ec9b0';
    statusBarCodex.show();
  } else {
    statusBarCodex.hide();
  }

  let claudeTabs: TabStatus[] = [];
  let currentClaude: TabStatus | undefined;
  if (hasClaude) {
    scanClaudeTranscripts();
    const claudeLimits = getClaudeLimits();
    claudeTabs = openClaudeTabs().map((t) => statusForClaude(t, claudeLimits.threshold, claudeLimits.loop));
    // Report the worst-case (highest usage %) across all Claude tabs.
    if (claudeTabs.length > 0) {
      currentClaude = claudeTabs.reduce((worst, tab) => (tab.percent ?? -1) > (worst.percent ?? -1) ? tab : worst);
    }
    // Fallback: if tab matching failed, read the most recent session file directly.
    if (!currentClaude || !currentClaude.matched) {
      const recent = findMostRecentClaudeSession();
      if (recent) currentClaude = recent;
    }
  }

  if (hasAgy && Date.now() - agyQuotaTry > 60000) refreshAgyQuota();
  const agySession = hasAgy ? scanAntigravitySession() : null;
  if (!agySession) {
    statusBarAgy.hide();
    statusBarAgyTotal.hide();
  } else {
    updateAgyItems(agySession);
  }

  if (currentClaude) {
    const icon = ICONS[currentClaude.emoji];
    const text = `${currentClaude.label}
${fmt(currentClaude.context)} / ${fmt(currentClaude.loop)} (${currentClaude.percent}%)`;
    sideBarButton.text = icon;
    sideBarButton.tooltip = text;
    statusBarClaude.text = `${icon} Claude ${fmt(currentClaude.context)} (${currentClaude.percent}%)`;
    statusBarClaude.tooltip = `${text}
Model: ${currentClaude.model || '-'}`;
    statusBarClaude.color = currentClaude.color;
    statusBarClaude.show();
    sideBarButton.show();
  } else {
    statusBarClaude.hide();
    if (agySession) {
      sideBarButton.text = '$(triangle-up)';
      sideBarButton.tooltip = `Antigravity: ${agySession.title} (${fmt(agySession.tokens)})`;
      sideBarButton.show();
    } else {
      sideBarButton.hide();
    }
  }

  webviewProvider.post({ agySession, claudeTabs, codexSession });
  writeAiStatus(agySession, currentClaude, codexSession);
}

function updateAgyItems(agySession: AntigravitySession) {
  const agyIcon = '$(triangle-up)';
  const q = agyQuota && Date.now() - agyQuota.at < 5 * 60000 ? agyQuota : null;
  if (q) {
    statusBarAgyTotal.text = `${agyIcon} AGY 5h ${q.usedPct}% (${fmtLeft(q.resetMs)})`;
    statusBarAgyTotal.tooltip = 'Antigravity 실제 쿼터 (사용량 / 리셋까지)\n' + q.groups
      .map((g) => `${Math.round((1 - g.remaining) * 100)}% 사용 · ${fmtLeft(g.resetMs)} 후 리셋 — ${g.models.slice(0, 3).join(', ')}${g.models.length > 3 ? ` 외 ${g.models.length - 3}개` : ''}`)
      .join('\n')
      + q.windows.map((w) => `\n${w.group} ${w.window === 'weekly' ? '주간' : '5시간'} ${w.usedPct}% · ${fmtLeft(w.resetMs)} 후 리셋`).join('');
    statusBarAgyTotal.color = q.usedPct >= 100 ? '#ef4444' : q.usedPct >= 80 ? '#eab308' : '#888888';
  } else {
    statusBarAgyTotal.text = `${agyIcon} AGY 5h ${agySession.agyFiveHourPercent ?? 0}% (${fmtLeft(agySession.agyFiveHourResetMs ?? 0)})`;
    statusBarAgyTotal.tooltip = `추정치 (실제 쿼터 조회 실패: ${agyQuotaErr})\n최근 5시간 Antigravity 로그 바이트 / 3.8 ÷ 5M`;
    statusBarAgyTotal.color = '#888888';
  }
  statusBarAgyTotal.show();

  statusBarAgy.text = `${agyIcon} AGY ${fmt(agySession.tokens)} (${agySession.percent}%)`;
  statusBarAgy.tooltip = new vscode.MarkdownString(
    `### Google Antigravity Usage

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
    + `*클릭하여 토큰 라우터 패널 열기*`
  );
  statusBarAgy.color = agySession.color;
  statusBarAgy.show();
}

class TokenRouterWebviewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private lastData: { agySession: AntigravitySession | null; claudeTabs: TabStatus[]; codexSession: CodexUsage | null } = { agySession: null, claudeTabs: [], codexSession: null };

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = HTML;
    webviewView.onDidChangeVisibility(() => this.post(this.lastData));
    this.post(this.lastData);
  }

  public post(data: { agySession: AntigravitySession | null; claudeTabs: TabStatus[]; codexSession: CodexUsage | null }) {
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

export function deactivate() {}
