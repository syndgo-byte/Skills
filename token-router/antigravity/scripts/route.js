#!/usr/bin/env node
'use strict';
// Antigravity Token Router - Model & Subagent Recommender
// Recommends Gemini models (flash_lite, flash, pro) and subagents to save context tokens.
//
// Usage:
//   node route.js "<task description>"
//   node route.js --stats

const state = require('./state');

const SIGNALS = {
  flash_lite: [
    [/어디(에|서)?\s*(있|정의|쓰)|검색|목록|나열|몇\s*개|확인만|번역|뭐야|알려줘|보여줘/, 3],
    [/\b(where is|search|grep|list|locate|count|translate|what does|look up|show me)\b/i, 3],
    [/찾아|읽어|요약|분류|설명해|\b(find|read|summari[sz]e|classify|explain)\b/i, 2, 'weak'],
    [/이름\s*바꿔|리네임|rename|포맷|format|오타|typo|주석\s*달/i, 3],
  ],
  flash: [
    [/구현(?!된|되|돼)|추가해|만들어|엔드포인트|컴포넌트|테스트\s*(작성|추가|짜|만들)|타입\s*힌트|일괄|변환해|리팩터|정리해|개선해|최적화해|배포해/, 2],
    [/\b(implement|add|build|feature|endpoint|component|update|tests?|type hints?|convert|bulk|refactor|clean ?up|improve|optimi[sz]e|deploy)\b/i, 3],
    [/수정(?!본|된|사항)|고쳐|\bfix\b/i, 1],
    [/스크립트|엑셀|시트|csv|파싱|집계|합계|계산|정산|script|excel|spreadsheet|parse|aggregate/i, 3],
  ],
  pro: [
    [/설계|아키텍처|구조를?\s*(어떻게|잡)|트레이드오프|어떤\s*방식|어떻게\s*가져갈|고민|전략|계획\s*세워|보안|취약|무결성|성능\s*분석|버그/, 4],
    [/왜\s*(이렇|안\s*되|안\s*돼|느려)|원인|근본|디버깅|가끔|재현/, 4],
    [/\b(design|architecture|why (does|is)|root cause|trade-?offs?|which approach|strategy|security|vulnerab|race condition|deadlock|intermittent|flaky|debug|performance analysis|bug)\b/i, 4],
    [/애매|모호|확실하지|잘 모르|unclear|ambiguous|not sure/i, 3],
    [/전체\s*리팩터|대규모|여러\s*모듈|cross-cutting|large refactor|whole (app|system)/i, 3],
  ]
};

const SUBAGENT_SIGNALS = {
  research: [
    [/코드베이스\s*전체|모든\s*파일|다\s*찾아|광범위|조사해|검색해|문서\s*확인|웹\s*검색/, 3],
    [/\b(survey|codebase search|all files|research|lookup docs)\b/i, 3]
  ],
  self: [
    [/대용량|엑셀\s*\d+개|csv\s*\d+개|파일\s*\d+개|대량\s*데이터/, 3]
  ]
};

function score(task) {
  const scores = { flash_lite: 0, flash: 0, pro: 0 };
  const hits = [];
  const weak = [];

  for (const [route, rules] of Object.entries(SIGNALS)) {
    for (const [re, w, kind] of rules) {
      const m = task.match(re);
      if (!m) continue;
      if (kind === 'weak') { weak.push([route, w, m[0].trim()]); continue; }
      scores[route] += w; hits.push(`${route}:${m[0].trim()}`);
    }
  }

  if (scores.flash + scores.pro === 0) {
    for (const [route, w, word] of weak) {
      scores[route] += w; hits.push(`${route}:${word}`);
    }
  }

  // Length heuristics
  if (scores.flash === 0 && scores.pro === 0) {
    if (task.length > 250 && task.length <= 500) { scores.flash += 2; hits.push('flash:중간길이'); }
  }
  if (scores.pro === 0 && scores.flash < 2) {
    if (task.length > 500) { scores.pro += 2; hits.push('pro:긴요구사항'); }
  }
  if (task.length < 50 && scores.pro === 0 && scores.flash === 0) {
    scores.flash_lite += 1;
  }

  // Subagent scoring
  let subagent = null;
  let subagentWhy = null;
  for (const [agentName, rules] of Object.entries(SUBAGENT_SIGNALS)) {
    for (const [re, w] of rules) {
      const m = task.match(re);
      if (m) {
        subagent = agentName;
        subagentWhy = m[0].trim();
        break;
      }
    }
    if (subagent) break;
  }

  return { scores, hits, subagent, subagentWhy };
}

function decide(task) {
  const { scores, hits, subagent, subagentWhy } = score(task);
  let best = 'flash';
  let highest = -1;

  for (const [route, pts] of Object.entries(scores)) {
    if (pts > highest) {
      highest = pts;
      best = route;
    }
  }

  let effort = 'low';
  if (best === 'pro') {
    effort = highest >= 6 ? 'high' : 'medium';
  } else if (best === 'flash') {
    effort = highest >= 4 ? 'medium' : 'low';
  } else {
    effort = 'low';
  }

  const result = {
    route: best,
    modelName: best === 'pro' ? 'Gemini 3.8 Pro' : (best === 'flash_lite' ? 'Gemini Flash Lite' : 'Gemini 3.8 Flash'),
    effort,
    subagent: subagent ? { type: subagent, model: best === 'pro' ? 'flash' : 'flash_lite', why: subagentWhy } : null,
    why: hits.slice(0, 3).join(', ') || '기본 추천',
    by: 'rules'
  };

  state.log({ type: 'route', task: task.slice(0, 80), ...result });
  return result;
}

function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.log(JSON.stringify(decide('테스트 작업')));
    return;
  }
  if (args[0] === '--stats') {
    console.log('Antigravity Token Router 활성화됨');
    return;
  }
  const task = args.join(' ');
  console.log(JSON.stringify(decide(task), null, 2));
}

if (require.main === module) {
  main();
}

module.exports = { decide, score };
