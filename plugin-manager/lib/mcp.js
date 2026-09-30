'use strict';
// User-scope MCP servers from ~/.claude.json and their health via `claude mcp list`.
const { execFile } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { buildEnv } = require('./cli');

const USER_CONFIG = path.join(os.homedir(), '.claude.json');

// Names and launch commands only; env and headers may hold secrets and are never read out.
function listUser(readJson) {
  const servers = (readJson(USER_CONFIG, {}) || {}).mcpServers || {};
  return Object.entries(servers).map(([name, s]) => ({
    name,
    type: s.type || (s.url ? 'http' : 'stdio'),
    target: s.url || [s.command, ...(s.args || [])].filter(Boolean).join(' '),
  }));
}

// Parses lines like "model-router: python server.py - ✔ Connected".
function parseHealth(stdout) {
  const health = {};
  for (const line of stdout.split(/\r?\n/)) {
    const m = line.match(/^(.+?): .* - (?:[✔✓]\s*(Connected)|[✗✘]\s*(.+))$/);
    if (m) health[m[1]] = m[2] ? { ok: true, text: m[2] } : { ok: false, text: m[3].trim() };
  }
  return health;
}

function checkHealth(claudePath) {
  return new Promise((resolve) => {
    execFile(claudePath, ['mcp', 'list'], { env: buildEnv(), timeout: 60000, windowsHide: true },
      (err, stdout) => resolve(err && !stdout ? { error: err.message } : parseHealth(stdout || '')));
  });
}

// Folder of a stdio server that keeps run logs (model-router style: policy.json + runs.jsonl + active/).
function activityDir(server) {
  const script = server.target.split(' ').find((a) => /\.py$|\.js$/.test(a));
  if (!script) return null;
  const dir = path.dirname(script);
  return fs.existsSync(path.join(dir, 'policy.json')) ? dir : null;
}

// In-flight runs and the most recent finished runs.
function readActivity(dir, recent = 5) {
  const active = [];
  const activeDir = path.join(dir, 'active');
  for (const f of (fs.existsSync(activeDir) ? fs.readdirSync(activeDir) : [])) {
    try { active.push(JSON.parse(fs.readFileSync(path.join(activeDir, f), 'utf8'))); } catch { /* being written */ }
  }
  let runs = [];
  try {
    runs = fs.readFileSync(path.join(dir, 'runs.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean)
      .slice(-recent).map((l) => JSON.parse(l)).reverse();
  } catch { /* no runs yet */ }
  return { active, runs };
}

function readPolicy(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'policy.json'), 'utf8')); } catch { return null; }
}

// Per-tool plan and quota from the MCP Hub (the same endpoint the router reads).
function fetchHub(hubUrl) {
  return new Promise((resolve) => {
    const req = http.get(`${hubUrl.replace(/\/$/, '')}/ai/tools`, { timeout: 4000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        if (res.statusCode >= 400) return resolve({ error: `HTTP ${res.statusCode}` });
        try { resolve(JSON.parse(body)); } catch (e) { resolve({ error: e.message }); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('시간 초과')));
    req.on('error', (e) => resolve({ error: e.message }));
  });
}

// Mirrors model-router core.assess(): only limits[] count, usage.used_pct is the context window.
function assess(tool, threshold) {
  const values = (tool.limits || []).map((l) => l.used_pct).filter((v) => v != null).map(Number);
  const worst = values.length ? Math.max(...values) : null;
  let reason = null;
  if (tool.paid === false) reason = '유료 플랜 아님';
  else if (tool.renews_at && Date.parse(tool.renews_at) < Date.now()) reason = '요금제 갱신일 지남';
  else if (tool.status !== 'ok') reason = `상태 ${tool.status}`;
  else if (worst != null && worst >= threshold) reason = `한도 ${worst}% ≥ ${threshold}%`;
  return { available: !reason, worst, reason };
}

module.exports = { USER_CONFIG, listUser, parseHealth, checkHealth, activityDir, readActivity, readPolicy, fetchHub, assess };
