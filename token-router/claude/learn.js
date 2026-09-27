#!/usr/bin/env node
'use strict';
// Learns from past conversations where routing likely went wrong, with no feedback input:
//   - under: the user's next message complains ("아니", "엉뚱", "그게 아니라") -> model may have been too weak
//   - over:  an expensive model answered briefly with no tool calls -> a cheaper one would likely do
// Writes ~/.claude/token-router/learn-report.json. Never edits route.js; signals change only
// after a person reviews the report and route.test.js passes.
//
//   node learn.js [sessions=30]   -> report to stdout and file
//   node learn.js start           -> SessionStart hook: refreshes the report at most once a day, silent
const fs = require('fs');
const os = require('os');
const path = require('path');
const { decide } = require('./route');

const PROJECTS = path.join(os.homedir(), '.claude', 'projects');
const REPORT = path.join(os.homedir(), '.claude', 'token-router', 'learn-report.json');
const TIERS = ['haiku', 'sonnet', 'opus', 'fable'];
const COMPLAINT = /^(아니|아냐|그게\s*아니|그거\s*말고)|엉뚱|잘못\s*(했|이해|알아)|틀렸|말귀|이해\s*못|다시\s*해|그\s*말이\s*아니|that's not|wrong|not what i/i;
const OVER_MAX_CHARS = 400;

const tierOf = (model) => TIERS.findIndex((t) => String(model).includes(t));

// A real user prompt is typed text, not a tool result, slash command or injected tag block.
function promptText(msg) {
  const c = msg && msg.content;
  let text = '';
  if (typeof c === 'string') text = c;
  else if (Array.isArray(c)) {
    if (c.some((b) => b.type === 'tool_result')) return '';
    text = c.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  }
  text = text.replace(/<([a-z_-]+)[^>]*>[\s\S]*?<\/\1>/gi, '').trim();
  if (!text || text.startsWith('/') || text.startsWith('<')) return '';
  return text;
}

// One turn = a prompt plus every assistant entry until the next prompt (tool loops included).
function turns(file) {
  const out = [];
  let cur = null;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.isSidechain) continue;
    if (e.type === 'user') {
      const p = promptText(e.message);
      if (p) { cur = { prompt: p, model: '', chars: 0, tools: 0 }; out.push(cur); }
    } else if (e.type === 'assistant' && cur && Array.isArray(e.message?.content)) {
      cur.model = e.message.model || cur.model;
      for (const b of e.message.content) {
        if (b.type === 'text') cur.chars += b.text.length;
        if (b.type === 'tool_use') cur.tools += 1;
      }
    }
  }
  return out.filter((t) => tierOf(t.model) >= 0);
}

function recentFiles(n) {
  const files = [];
  for (const d of fs.readdirSync(PROJECTS)) {
    const dir = path.join(PROJECTS, d);
    let names = [];
    try { names = fs.readdirSync(dir); } catch { continue; }
    for (const f of names) {
      if (f.endsWith('.jsonl')) files.push({ f: path.join(dir, f), t: fs.statSync(path.join(dir, f)).mtimeMs });
    }
  }
  return files.sort((a, b) => b.t - a.t).slice(0, n).map((x) => x.f);
}

async function learn(sessions) {
  const under = [];
  const over = [];
  let total = 0;
  for (const file of recentFiles(sessions)) {
    const ts = turns(file);
    for (let i = 0; i < ts.length; i += 1) {
      const t = ts[i];
      total += 1;
      const used = tierOf(t.model);
      const d = await decide(t.prompt);
      const row = { prompt: t.prompt.slice(0, 120), used: TIERS[used], router: d.route, why: d.why };
      const next = ts[i + 1];
      if (next && COMPLAINT.test(next.prompt.trim())) under.push({ ...row, complaint: next.prompt.slice(0, 60) });
      else if (used >= 2 && t.tools === 0 && t.chars < OVER_MAX_CHARS) over.push({ ...row, chars: t.chars });
    }
  }
  const report = { at: new Date().toISOString(), sessions, turns: total, under, over };
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n', 'utf8');
  return report;
}

function print(r) {
  console.log(`최근 대화 ${r.sessions}개, 요청 ${r.turns}개 분석\n`);
  console.log(`⬇️ 모델이 약했을 수 있음 (다음 메시지가 불만): ${r.under.length}개`);
  for (const x of r.under.slice(0, 10)) console.log(`  ${x.used.padEnd(6)} 라우터:${x.router.padEnd(6)} | ${x.prompt.slice(0, 50)}\n    → "${x.complaint}"`);
  console.log(`\n⬆️ 더 싼 모델로 충분했을 수 있음 (Opus 이상, 도구 없이 ${OVER_MAX_CHARS}자 미만): ${r.over.length}개`);
  for (const x of r.over.slice(0, 10)) console.log(`  ${x.used.padEnd(6)} 라우터:${x.router.padEnd(6)} | ${x.prompt.slice(0, 50)} (${x.chars}자)`);
  console.log(`\n보고서: ${REPORT}`);
}

// Auto-adjustment: reduce signal weights when the router consistently misses problems.
async function findWeakSignals(under) {
  // Group complaints by used model -> router prediction, count duplicates
  const signals = {}; // { 'sonnet': 5, 'opus': 2, ... }
  const bySignal = {}; // { 'sonnet': ['버그 수정', '성능 분석', ...], ... }
  for (const row of under) {
    const used = row.used;
    if (!signals[used]) { signals[used] = 0; bySignal[used] = []; }
    signals[used] += 1;
    bySignal[used].push(row.prompt.slice(0, 30));
  }
  // Return only signals with 3+ complaints
  const weak = Object.entries(signals).filter(([_, count]) => count >= 3).map(([signal]) => signal);
  return { weak, signals, bySignal };
}

async function adjustSignals(adjustments) {
  const routePath = path.join(path.dirname(REPORT), '..', 'route.js');
  let code = fs.readFileSync(routePath, 'utf8');
  const orig = code;

  for (const [signal, newWeight] of adjustments) {
    // e.g., sonnet: [[ /.../, 3], [...], ...] -> reduce 3 to 2
    const pattern = new RegExp(`(${signal}:\\s*\\[[^\\]]*?\\[([^,]+),\\s*)${newWeight + 1}(,`, 'g');
    code = code.replace(pattern, `$1${newWeight}$3`);
  }

  if (code === orig) return false; // no changes made

  fs.writeFileSync(routePath, code, 'utf8');
  return true;
}

async function runTests() {
  const { runTests: run } = require('./route.test');
  const result = await run(false, true);
  return result.ok;
}

async function autoAdjust(report) {
  if (!report.under || report.under.length === 0) return;

  const { weak, signals } = await findWeakSignals(report.under);
  if (weak.length === 0) {
    console.log('ℹ️ 자동 조정 조건 미충족: 신호별 3건 이상 불만 없음');
    return;
  }

  console.log(`⚠️ 신호 가중치 자동 조정 시도: ${weak.join(', ')}`);
  const adjustments = weak.map((s) => [s, (TIERS.indexOf(s) < 0 ? 1 : signals[s] >= 5 ? 1 : 2)]);

  // Back up original route.js
  const routePath = path.join(path.dirname(REPORT), '..', 'route.js');
  const backup = routePath + '.backup-' + Date.now();
  fs.copyFileSync(routePath, backup);

  if (!(await adjustSignals(adjustments))) {
    console.log('❌ 신호 가중치 수정 실패');
    fs.copyFileSync(backup, routePath);
    return;
  }

  // Verify with route.test.js
  const testPassed = await runTests();
  if (testPassed) {
    console.log(`✅ 검증 성공: 신호 가중치 조정 반영 (${adjustments.map(([s, w]) => `${s}: -1`).join(', ')})`);
    fs.unlinkSync(backup);
  } else {
    console.log('❌ 검증 실패: 변경 롤백');
    fs.copyFileSync(backup, routePath);
  }
}

(async () => {
  if (process.argv[2] === 'start') {
    try {
      const age = Date.now() - fs.statSync(REPORT).mtimeMs;
      if (age < 24 * 3600 * 1000) return;
    } catch { }
    try {
      const report = await learn(30);
      await autoAdjust(report);
    } catch (err) {
      console.error('학습 오류:', err.message);
    }
    return;
  }
  const report = await learn(parseInt(process.argv[2], 10) || 30);
  print(report);
})();
