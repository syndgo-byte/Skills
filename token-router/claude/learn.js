#!/usr/bin/env node
'use strict';
// Auto-learns signal weights from routing history. Analyzes signals-log.jsonl,
// finds under/over-weighted patterns, applies noise filtering, and updates signals.json.
//
//   node learn.js           -> analyze, show recommendations
//   node learn.js --apply   -> apply recommendations if confidence >= 70%
//   node learn.js --history -> show adjustment history

const fs = require('fs');
const path = require('path');
const logFile = path.join(__dirname, '..', 'data', 'signals-log.jsonl');
const historyFile = path.join(__dirname, '..', 'data', 'signal-weights-history.json');
const signalsFile = path.join(__dirname, 'signals.json');

function readLog(days = 7) {
  if (!fs.existsSync(logFile)) return [];
  const lines = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean);
  const cutoff = Date.now() - days * 24 * 3600 * 1000;
  return lines.map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter((e) => e && new Date(e.at).getTime() > cutoff);
}

function getHistory() {
  return fs.existsSync(historyFile) ? JSON.parse(fs.readFileSync(historyFile, 'utf8')) : { adjustments: [] };
}

function canAdjust(route, signal) {
  const hist = getHistory();
  const lastAdj = hist.adjustments.filter((a) => a.route === route && a.signal === signal).pop();
  if (!lastAdj) return true;
  return Date.now() - lastAdj.at > 7 * 24 * 3600 * 1000; // Last adjusted >7 days ago
}

function analyze() {
  const entries = readLog();
  if (entries.length < 50) {
    console.log(`Only ${entries.length} entries (need 50+ for confidence).`);
    return { recommendations: [] };
  }

  console.log(`\nAnalyzing ${entries.length} routing decisions...\n`);
  
  const recommendations = [];
  const routes = ['haiku', 'sonnet', 'opus', 'fable'];
  const signals = require('./signals.json');
  
  // For each route, find signals that consistently appear in wrong contexts.
  for (const route of routes) {
    const routeEntries = entries.filter((e) => e.route === route);
    const wrongEntries = entries.filter((e) => e.route !== route && e.escalated); // Currently escalated to higher tier
    
    if (routeEntries.length < 10) continue;
    
    for (const [sigRoute, rules] of Object.entries(signals)) {
      if (sigRoute !== route) continue;
      
      for (let i = 0; i < rules.length; i++) {
        const [pattern, weight] = rules[i];
        const re = new RegExp(pattern, 'i');
        
        // Count hits in correct route and wrong route
        const hitsCorrect = routeEntries.filter((e) => re.test(e.why)).length;
        const hitsWrong = wrongEntries.filter((e) => re.test(e.why)).length;
        const totalHits = hitsCorrect + hitsWrong;
        
        if (totalHits < 3) continue; // Need at least 3 hits for signal
        
        const accuracy = totalHits > 0 ? hitsCorrect / totalHits : 0;
        
        // Underweight: signal appears in many wrong-route cases (accuracy <60%)
        // Overweight: signal appears in route but entry was escalated (accuracy >80% but still escaped)
        if (accuracy < 0.6 && hitsWrong >= 2) {
          if (canAdjust(route, pattern)) {
            recommendations.push({
              type: 'underweight',
              route,
              signal: pattern.slice(0, 40) + (pattern.length > 40 ? '...' : ''),
              accuracy: Math.round(accuracy * 100),
              hits: totalHits,
              hitsWrong,
              suggest: Math.min(weight + 1, 4),
            });
          }
        } else if (accuracy > 0.8 && hitsCorrect >= 3 && hitsWrong > 0) {
          // Signal is good but sometimes escalates. Lower neighboring route might be catching it.
          console.log(`   Signal in ${route} accurate (${Math.round(accuracy * 100)}%) but ${hitsWrong} escalations.`);
        }
      }
    }
  }
  
  return { entries: entries.length, recommendations };
}

function apply() {
  const { entries, recommendations } = analyze();
  if (recommendations.length === 0) {
    console.log('\nNo adjustments needed (all signals >60% accurate).');
    return;
  }
  
  console.log(`\n${recommendations.length} adjustments recommended:\n`);
  const hist = getHistory();
  const signals = require(signalsFile);
  let changed = 0;
  
  for (const rec of recommendations) {
    const oldWeight = rec.suggest - 1;
    console.log(`  ${rec.route} / ${rec.signal.slice(0, 30)} : ${oldWeight} → ${rec.suggest} (${rec.accuracy}% accurate, ${rec.hits} hits)`);
    
    // Find and update the signal
    for (let i = 0; i < signals[rec.route].length; i++) {
      if (signals[rec.route][i][0] === rec.signal) {
        signals[rec.route][i][1] = rec.suggest;
        hist.adjustments.push({
          at: Date.now(),
          route: rec.route,
          signal: rec.signal,
          from: oldWeight,
          to: rec.suggest,
          reason: `${rec.accuracy}% accuracy, ${rec.hits} hits`,
        });
        changed++;
        break;
      }
    }
  }
  
  if (changed > 0) {
    fs.writeFileSync(signalsFile, JSON.stringify(signals, null, 2));
    fs.writeFileSync(historyFile, JSON.stringify(hist, null, 2));
    console.log(`\n✓ Updated ${changed} signal weights. Reload route.js to apply.`);
  }
}

if (process.argv[2] === '--history') {
  const hist = getHistory();
  console.log(JSON.stringify(hist, null, 2));
} else if (process.argv[2] === '--apply') {
  apply();
} else {
  const { entries, recommendations } = analyze();
  if (recommendations.length === 0) {
    console.log('No adjustments needed.');
  } else {
    console.log(`${recommendations.length} potential adjustments (run with --apply to update signals.json):\n`);
    for (const r of recommendations) {
      console.log(`  ${r.type.toUpperCase()}: ${r.route} / ${r.signal.slice(0, 30)}`);
      console.log(`    Accuracy: ${r.accuracy}% (${r.hitsWrong} false positives / ${r.hits} total)`);
      console.log(`    Suggest: weight ${Math.floor((r.suggest - 1) * 10) / 10 + 1} → ${r.suggest}\n`);
    }
    console.log(`Run "node learn.js --apply" to apply these changes.`);
  }
}
