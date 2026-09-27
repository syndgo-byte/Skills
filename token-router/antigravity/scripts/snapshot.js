#!/usr/bin/env node
'use strict';
// Antigravity Token Router - Snapshot utility
// Compresses changed project files into <project>/backup-antigravity/<date-time>/<path>.gz
//
// Usage:
//   node snapshot.js [projectDir]
//   node snapshot.js --list [projectDir]
//   node snapshot.js --restore <stamp|latest> [file] [--project <dir>]

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const state = require('./state');

const DEFAULT = { maxGB: 5, fileMB: 200 };
const BACKUP = 'backup-antigravity';
const STAMP = /^\d{8}-\d{6}$/;

const SKIP_DIRS = new Set([
  BACKUP, 'backup-claude', '.git', 'node_modules', '.venv', 'venv', '__pycache__',
  'dist', 'build', '.next', '.cache', '.handoff', '.idea', '.vs', 'target', 'bin', 'obj', '.agents'
]);

const SKIP_FILES = [
  /(^|\/)\.env(\..*)?$/i, /\.(pem|key|p12|pfx|keystore|jks)$/i, /(^|\/)id_(rsa|ed25519|ecdsa)[^/]*$/i,
  /(^|\/)(credentials|secrets?)(\.[a-z]+)?$/i, /~\$/, /\.(tmp|log)$/i
];

function prepareBackupDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  for (const f of ['.ignore', '.gitignore']) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) fs.writeFileSync(p, '*\n', 'utf8');
  }
}

function walk(root, visit) {
  const go = (d) => {
    let items = [];
    try { items = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const it of items) {
      const full = path.join(d, it.name);
      if (it.isDirectory()) {
        if (!SKIP_DIRS.has(it.name)) go(full);
      } else if (it.isFile()) {
        const rel = path.relative(root, full).replace(/\\/g, '/');
        if (!SKIP_FILES.some((re) => re.test(rel))) visit(full, rel);
      }
    }
  };
  go(root);
}

async function snapshot(projectDir) {
  const root = path.resolve(projectDir || process.cwd());
  const backupRoot = path.join(root, BACKUP);
  prepareBackupDir(backupRoot);

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const outDir = path.join(backupRoot, stamp);

  let count = 0;
  walk(root, (full, rel) => {
    try {
      const targetGz = path.join(outDir, `${rel}.gz`);
      fs.mkdirSync(path.dirname(targetGz), { recursive: true });
      const src = fs.createReadStream(full);
      const dest = fs.createWriteStream(targetGz);
      const gzip = zlib.createGzip({ level: 6 });
      src.pipe(gzip).pipe(dest);
      count++;
    } catch { /* skip failed files */ }
  });

  console.log(`[Antigravity Snapshot] ${count}개 파일 백업 완료: ${outDir}`);
}

function list(projectDir) {
  const root = path.resolve(projectDir || process.cwd());
  const backupRoot = path.join(root, BACKUP);
  if (!fs.existsSync(backupRoot)) {
    console.log('백업 내역이 없습니다.');
    return;
  }
  const dirs = fs.readdirSync(backupRoot).filter((d) => STAMP.test(d)).sort();
  console.log(`[스냅샷 목록] (${root})`);
  dirs.forEach((d) => console.log(`  - ${d}`));
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--list')) {
    list(args[args.indexOf('--list') + 1]);
  } else {
    snapshot(args[0]);
  }
}

if (require.main === module) {
  main();
}

module.exports = { snapshot, list };
