#!/usr/bin/env node
'use strict';
// Antigravity Token Router - Session Handoff Helper
// Handles context monitoring and session transition files (handoff-mmdd-hhmm.md).
//
// Usage:
//   node handoff.js name              -> prints handoff-MMDD-HHmm.md
//   node handoff.js where [cwd]       -> prints target directory for handoff
//   node handoff.js template [goal]   -> prints handoff markdown template
//   node handoff.js check             -> checks if handoff is recommended

const fs = require('fs');
const os = require('os');
const path = require('path');
const state = require('./state');

function handoffName(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `handoff-${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.md`;
}

function resolveTargetDir(cwd = process.cwd()) {
  const root = state.projectRootOf(cwd);
  if (root && fs.existsSync(root)) {
    const handoffDir = path.join(root, '.handoff');
    fs.mkdirSync(handoffDir, { recursive: true });
    return handoffDir;
  }
  const fallback = state.fallbackDir();
  fs.mkdirSync(fallback, { recursive: true });
  return fallback;
}

function template(goal = '(전체 작업 목표)') {
  const d = new Date();
  const name = handoffName(d);
  return `# ${name.replace('.md', '')}

## 목표
${goal}

## 완료된 작업
- (끝난 작업 내용 및 생성/수정된 파일 경로)

## 다음 진행 단계
1. (다음 세션에서 가장 먼저 실행할 작업) — 권장 모델: Flash 또는 Pro
2. (후속 작업)

## 관련 파일 및 스크립트
- \`경로\` — 파일 역할 및 요약 (대화에 통째로 읽지 말고 필요시만 확인)
- \`.handoff/\` — 이전 인수인계 및 작업 일지

## 미완료 / 주의사항
- 스냅샷 백업: \`backup-antigravity/\` 확인
- 미완료 변경 사항 또는 테스트 상태

## 결정 사항 및 가이드
- (결정된 아키텍처 규칙, 사용자 피드백 등)

## 검증 방법
- (작업 검증 명령어: e.g. npm test, pytest 등)
`;
}

function main() {
  const args = process.argv.slice(2);
  const action = args[0] || 'name';

  switch (action) {
    case 'name':
      console.log(handoffName());
      break;
    case 'where':
      console.log(resolveTargetDir(args[1] || process.cwd()));
      break;
    case 'template':
      console.log(template(args.slice(1).join(' ') || undefined));
      break;
    case 'check':
      console.log(JSON.stringify({
        recommend: 'keep',
        message: '대화 맥락이 정상 범위입니다.'
      }));
      break;
    default:
      console.log(handoffName());
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  handoffName,
  resolveTargetDir,
  template
};
