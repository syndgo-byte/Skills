'use strict';
// User-scope MCP servers from ~/.claude.json and their health via `claude mcp list`.
const { execFile } = require('child_process');
const fs = require('fs');
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

module.exports = { USER_CONFIG, listUser, parseHealth, checkHealth, activityDir, readActivity };
