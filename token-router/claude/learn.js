#!/usr/bin/env node
'use strict';
const fs = require('fs'), path = require('path');
const logFile = path.join(__dirname, '..', 'data', 'signals-log.jsonl');
const historyFile = path.join(__dirname, '..', 'data', 'signal-weights-history.json');
const signalsFile = path.join(__dirname, 'signals.json');

function readLog(days = 7) {
  if (!fs.existsSync(logFile)) return [];
  const lines = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean);
  const cutoff = Date.now() - days * 24 * 3600 * 1000;
  return lines.map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((e) => e && new Date(e.at).getTime() > cutoff);
}

function getHistory() {
  return fs.existsSync(historyFile) ? JSON.parse(fs.readFileSync(historyFile, 'utf8')) : { adjustments: [] };
}

function canAdjust(route, signal) {
  const hist = getHistory();
  const lastAdj = hist.adjustments.filter((a) => a.route === route && a.signal === signal).pop();
  if (!lastAdj) return true;
  return Date.now() - lastAdj.at > 7 * 24 * 3600 * 1000;
}

function applyLearning() {
  const entries = readLog(1 / 24);
  if (entries.length === 0) {
    console.log('[learn] No data in last hour.');
    return;
  }
  
  const hist = getHistory();
  const signals = require('./signals.json');
  let changed = 0;
  
  const routes = ['haiku', 'sonnet', 'opus', 'fable'];
  for (const route of routes) {
    const routeEntries = entries.filter((e) => e.route === route);
    if (routeEntries.length < 5) continue;
    
    for (const [sigRoute, rules] of Object.entries(signals)) {
      if (sigRoute !== route) continue;
      
      for (let i = 0; i < rules.length; i++) {
        const [pattern, weight] = rules[i];
        const re = new RegExp(pattern, 'i');
        const hits = routeEntries.filter((e) => re.test(e.why)).length;
        
        if (hits > 0 && canAdjust(route, pattern.slice(0, 40))) {
          const newWeight = Math.min(weight + 1, 4);
          signals[route][i][1] = newWeight;
          hist.adjustments.push({
            at: Date.now(), route, signal: pattern.slice(0, 40),
            from: weight, to: newWeight, hits
          });
          changed++;
        }
      }
    }
  }
  
  if (changed > 0) {
    fs.writeFileSync(signalsFile, JSON.stringify(signals, null, 2));
    fs.writeFileSync(historyFile, JSON.stringify(hist, null, 2));
    console.log(`[learn] ✓ Auto-learned: ${changed} signal${changed > 1 ? 's' : ''} updated`);
  }
}

if (process.argv[2] === 'start') {
  console.log('[learn] Started. Hourly auto-learning enabled.');
} else if (process.argv[2] === '--apply') {
  applyLearning();
} else {
  console.log('Usage: learn.js [start|--apply]');
}
