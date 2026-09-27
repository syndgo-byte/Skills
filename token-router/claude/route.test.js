#!/usr/bin/env node
'use strict';
// Test suite for route.js: verify that 13 representative tasks route to the expected model.
// Runs after signal adjustments to confirm they don't break core behavior.
//
//   node route.test.js [--verbose]   -> run tests, exit 0 if all pass, 1 if any fail
const { decide } = require('./route');

const tests = [
  // Haiku: lookup, search, reading, summarizing
  { prompt: "이 함수 어디 정의됐어?", expect: 'haiku', label: 'search:function-location' },
  { prompt: "where is the main entry point?", expect: 'haiku', label: 'search:entry-point' },
  { prompt: "이 파일 요약해줄래?", expect: 'haiku', label: 'summary:file-overview' },
  { prompt: "List all the API endpoints", expect: 'haiku', label: 'list:endpoints' },

  // Sonnet: implementation, tests, refactor (unless buggy)
  { prompt: "사용자 인증 엔드포인트 만들어줄래?", expect: 'sonnet', label: 'impl:auth-endpoint' },
  { prompt: "이 함수들 타입힌트 달아줄래?", expect: 'sonnet', label: 'refactor:type-hints' },
  { prompt: "제목 변수명을 소문자로 바꿔줄래?", expect: 'sonnet', label: 'edit:variable-rename' },
  { prompt: "Implement the error handler for database timeouts", expect: 'sonnet', label: 'impl:error-handler' },

  // Opus: debug, design, architecture, security, large refactors
  { prompt: "이 코드 왜 자꾸 느려? 원인 분석해줄래?", expect: 'opus', label: 'debug:performance-issue' },
  { prompt: "전체 아키텍처 재설계 어떻게 할까?", expect: 'opus', label: 'design:architecture-redesign' },
  { prompt: "왜 이 함수에 오류가 났을까? 재현 어떻게 해?", expect: 'opus', label: 'debug:intermittent-error' },
  { prompt: "보안 취약점 분석해줄래?", expect: 'opus', label: 'security:vulnerability-analysis' },
  { prompt: "Design a caching strategy for this use case", expect: 'opus', label: 'design:caching-strategy' },
];

async function runTests(verbose = false, noExit = false) {
  let passed = 0, failed = 0;
  for (const test of tests) {
    const result = await decide(test.prompt);
    const match = result.route === test.expect;
    if (match) {
      passed += 1;
      if (verbose) console.log(`✓ ${test.label}: ${result.route}`);
    } else {
      failed += 1;
      console.error(`✗ ${test.label}: expected ${test.expect}, got ${result.route} (${result.why})`);
    }
  }
  const result = { passed, failed, total: tests.length, ok: failed === 0 };
  console.log(`\n결과: ${passed}/${tests.length} 통과` + (failed > 0 ? `, ${failed} 실패` : ''));
  if (!noExit) process.exit(result.ok ? 0 : 1);
  return result;
}

if (require.main === module) {
  const verbose = process.argv[2] === '--verbose';
  runTests(verbose).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { tests, runTests };
