---
name: model_downgrade_haiku_preference
description: Actively downgrade to Haiku for simple tasks within scope limits
metadata:
  node_type: memory
  type: feedback
  originSessionId: e15f9423-da81-4fd9-b9c7-7b5c3332984a
  modified: 2026-09-27T09:28:51.037Z
---

**Rule:** Use token-router's SIGNALS logic directly. If task matches Haiku patterns (요약/확인/번역/찾아/읽어/이름바꿔), use Haiku **regardless of context size**.

**Haiku-grade tasks (from route.js SIGNALS):**
- 요약, 목록, 나열, 번역, 뭐야, 알려줘, 보여줘
- 찾아, 읽어, 확인만 (weak signals)
- `git commit` + `git push` with message already decided = 확인/실행
- Summary after work done = 요약

**NOT Haiku (stay Opus):**
- 설계, 아키텍처, 원인 분석, 버그, 보안, 성능 분석
- 고민, 전략, 트레이드오프 검토
- 코드 읽기/디버깅: User said "오퍼스가 하게끔 만들어 둔건데" — exemption applies

**Why:** token-router was designed to ignore context size when task is clearly in one tier. Following own policy instead of inventing new constraints.

**How to apply:**
- Match task against SIGNALS patterns first (not context size first)
- If score is clearly Haiku, use Haiku even if context is 150k+
- If ambiguous or higher score, check context constraints
