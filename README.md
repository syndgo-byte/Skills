# Skills

개인 AI/개발 도구 모음

## 폴더 구조

```
Skills/
├── token-router/          ⭐ 메인: Claude Code/Antigravity/Codex 토큰 라우팅
│   ├── extension/         VSCode 확장 (Claude context + AGY 쿼터 표시)
│   ├── claude/            Claude Code 스킬 ✅ 완성
│   ├── antigravity/       Antigravity 스킬 ⚠️ 미완성
│   └── codex/             Codex 스킬 ⚠️ 미완성
├── usage/
│   └── codex/             Codex 사용량 수집기
├── Claude_Skills/         Claude Code 플러그인 모음
│   ├── plugin-profiler    turn budget & 성능 프로파일링
│   ├── claude-plugin-manager
│   ├── free-ai-offers
│   └── token-audit
├── Codex_Skills/          (비어 있음)
└── Antigravity_Skills/    (비어 있음)
```

## token-router

> **Claude Code · Antigravity · Codex** 에서 200k context 도달 시 자동으로 정리해서 다음 세션으로 넘기는 토큰 관리 시스템

### 플랫폼별 상태

| 플랫폼 | 상태 | 기능 |
|---|---|---|
| **Claude Code** | ✅ 완성 | • 200k 자동 감시 • 실시간 handoff 파일 생성 • 모델 라우팅 • VSCode 상태표시줄 |
| **Antigravity** | ⚠️ 미완성 | • 코드 준비됨 • 훅 미등록 |
| **Codex** | ⚠️ 미완성 | • 코드 준비됨 • 수집기 미실행 |

### Claude Code 설치

```bash
cd token-router/claude
node install.js
```

### 사용 방법

1. 대화 진행 중 context가 80k에 도달하면 ⚠️ 경고
2. 200k 도달하면 📝 자동으로 인수인계 파일 생성
3. `/compact` 입력 → 압축 완료 후 자동으로 이어감

→ 더 자세한 내용: [`token-router/README.md`](token-router/README.md) 또는 [`token-router/claude/README.md`](token-router/claude/README.md)

---

## Claude_Skills

Claude Code 플러그인 & 성능 도구

- **plugin-profiler**: turn budget 계산 + 성능 프로파일링
- **claude-plugin-manager**: 플러그인 관리
- **token-audit**: 토큰 사용량 분석
- **free-ai-offers**: 무료 AI 서비스 목록

---

## usage/codex

Codex 사용량 실시간 수집기

- 실행: D:/Skills/usage/codex/start.ps1
- 중지: D:/Skills/usage/codex/stop.ps1

---

## 라이선스

개인 용도
