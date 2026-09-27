'use strict';
// Antigravity Token Router state and config
const fs = require('fs');
const os = require('os');
const path = require('path');

const DIR = path.join(os.homedir(), '.gemini', 'antigravity', 'token-router');
const STATE_FILE = path.join(DIR, 'state.json');
const LOG_FILE = path.join(DIR, 'log.jsonl');

function load() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { enabled: true }; }
}

function save(st) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(st, null, 2) + '\n', 'utf8');
}

function log(entry) {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n', 'utf8');
  } catch { /* ignore logging errors */ }
}

function fallbackDir() {
  const st = load();
  if (st.handoffHome) return st.handoffHome;
  return process.platform === 'win32' && fs.existsSync('D:\\') ? 'D:\\Antigravity_handoff' : path.join(os.homedir(), 'Antigravity_handoff');
}

const MARKERS = ['.agents', '.git', 'pyproject.toml', 'package.json', 'requirements.txt', 'setup.py', 'go.mod', 'Cargo.toml', 'GEMINI.md'];

function projectRootOf(file) {
  const home = os.homedir();
  const start = path.dirname(path.resolve(file));
  for (let d = start; ; d = path.dirname(d)) {
    if (MARKERS.some((m) => fs.existsSync(path.join(d, m)))) return d;
    if (d.toLowerCase() === home.toLowerCase() || path.dirname(d) === d) return start;
  }
}

module.exports = {
  DIR,
  STATE_FILE,
  LOG_FILE,
  load,
  save,
  log,
  fallbackDir,
  projectRootOf,
};
