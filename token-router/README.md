# token-router: 통합 토큰 관리 시스템

> Claude Code · Antigravity · Codex 에서 **긴 대화를 자동으로 끊고 정리하는** 토큰 라우팅 시스템

**구조:**
```
token-router/
├── extension/
│   └── claude/                (Claude Code VSCode extension - 활성)
├── claude/                    (Claude Code 스킬 - 완성)
├── antigravity/               (Antigravity 스킬 - 미완성)
└── codex/                     (Codex 스킬 - 미완성)
```

## 각 폴더 설명

### `extension/`
VSCode에 배포되는 확장 프로그램 (TypeScript)

- **claude/**: Claude Code의 상태표시줄 + Token Usage 패널
  - 현재 Claude context 실시간 표시
  - Antigravity 5h 쿼터 표시
  - 설치: C:\Users\[user]\.vscode\extensions\token-router-indicator\

### `claude/`
Claude Code 스킬 ✅ **완성**

- **handoff.js**: 200k 감시 + 자동 인수인계 파일 생성
- **route.js**: 작업 난도별 모델 자동 추천
- **state.js**: 라우팅 통계 & 로깅
- **install.js**: 설치/업데이트 스크립트
- **README.md**: 상세 사용법 및 플랫폼별 상태

**설치:**
```bash
node claude/install.js
```

### `antigravity/`
Antigravity 스킬 ⚠️ **미완성**

- **scripts/**: handoff.js, route.js, state.js (구현됨)
- **config.json**: Gemini 3.1/3.2/3.8 모델 매핑 (준비됨)

**상태:**
- ✓ 200k 감시 코드 구현
- ✓ 모델 라우팅 구조 준비
- ✗ Antigravity settings.json에 훅 미등록 → 아직 비활성

**다음:** Antigravity에서 settings 설정 후 훅 등록

### `codex/`
Codex 스킬 ⚠️ **미완성**

- **scripts/**: hook.py, router.py (구현됨)
- **dev-scripts/**: 테스트 & 유틸리티 스크립트
- **config.json**: Luna/Sol/Astra 모델 매핑

**상태:**
- ✓ 200k 감시 코드 구현 (hook.py)
- ✓ 라우팅 로직 구현 (router.py)
- ✗ 수집기 미실행 → 사용량 데이터 없음 → hook 미동작

**다음:** Codex 수집기 시작 후 실제 IDE에서 테스트

---

## 전체 기능 상태

| 플랫폼 | 상태 | 할 수 있는 것 |
|---|---|---|
| **Claude Code** | ✅ 완성 | 200k 감시 O, 자동 handoff O, 모델 라우팅 O, VSCode UI O |
| **Antigravity** | ⚠️ 준비 중 | 코드 준비됨, 설정 필요 |
| **Codex** | ⚠️ 준비 중 | 코드 준비됨, 수집기 필요 |

---

더 자세한 내용은 `claude/README.md`를 읽으세요.
