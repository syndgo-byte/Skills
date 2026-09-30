---
name: model-router
description: Codex·Antigravity 위임 라우터. 구현·테스트·리팩터처럼 토큰이 많이 드는 작업을 한도가 남은 도구에 넘기고, 난도(light/standard/complex)에 맞는 모델·effort를 고른다. "코덱스 시켜", "위임", "안티그래비티로", 도구별 한도 확인 요청에 사용.
---

# model-router

MCP 서버 `model-router`(사용자 범위 등록, `server.py`)의 도구를 쓴다.

1. `status()` — Claude·Codex·Antigravity 한도와 사용 가능 여부.
2. `route(task_type, tier?)` — 작업 유형별 첫 사용 가능 도구와 모델·effort. tier를 생략하면 프롬프트 키워드로 판정.
3. `delegate(tool, prompt, cwd, task_type, tier?)` — Codex/Antigravity 비대화형 실행. cwd는 `policy.json`의 `allowed_roots` 안이어야 한다.
4. 결과 diff는 Claude가 직접 검토·테스트한 뒤 `record_result(run_id, tests_passed, review_issues, note)`로 기록.
5. `report()` — 도구·작업 유형별 성공률과 한도 소모 비교.

조사·설계·리뷰·git은 Claude가 직접 한다. 위임 프롬프트에는 파일 경로, 바꿀 내용, 완료 조건을 구체적으로 적는다.
설정은 같은 폴더의 `policy.json`, 난도별 모델 표는 `README.md` 참고.
