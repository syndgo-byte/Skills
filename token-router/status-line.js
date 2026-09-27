#!/usr/bin/env node
'use strict';
// 상태 표시줄에 현재 맥락 크기 표시
const fs = require('fs');
const os = require('os');
const path = require('path');

const MONITOR_FILE = path.join(os.homedir(), '.claude', 'context-monitor.json');

try {
  const data = JSON.parse(fs.readFileSync(MONITOR_FILE, 'utf8'));

  const context = data.context || 0;
  const contextFormatted = data.contextFormatted || '0b';
  const thresholdPercent = data.thresholdPercent || 0;
  const loopThresholdPercent = data.loopThresholdPercent || 0;
  const recommendation = data.recommendation || 'CONTINUE';

  // 상태에 따라 이모지 선택
  let emoji = '📊'; // 기본
  if (recommendation === 'NEW_SESSION') emoji = '🟡'; // 80k 도달
  if (recommendation === 'STOP_LOOP') emoji = '🔴'; // 150k 도달

  // 상태 표시줄: "📊 60.5k | 80k:76% | 150k:40%" (60m과 Haiku 4.5 사이)
  console.log(`${emoji} ${contextFormatted} | 80k:${thresholdPercent}% | 150k:${loopThresholdPercent}%`);
} catch (e) {
  // 파일이 없으면 기본값 표시
  console.log('📊 - | 80k:0% | 150k:0%');
}
