# token-router

> **Claude Code · Antigravity · Codex** 에서 **긴 대화를 자동으로 끊고 정리해서 다음 세션으로 넘기는** 통합 토큰 관리 시스템

대화가 길어지면 토큰이 빠르게 줄어듭니다. token-router는 대화 맥락이 커지면:
- **80k**: 경고만 띄움 (계속 작업 가능)
- **200k**: 정리 후 handoff 파일 작성 → 자동 압축 후 그대로 이어감
- **모델 자동 선택**: 작업 난도에 맞는 최적 모델 추천

---

## 플랫폼별 상태

| 플랫폼 | 상태 | 모델 | 주요 기능 |
|---|---|---|---|
| **Claude Code** | ✅ **완성** | Haiku, Sonnet, Opus, Fable | • 200k 자동 감시 • 실시간 handoff 생성 • 모델 라우팅 • VSCode 상태표시줄 • 자동 압축 |
| **Antigravity** | ⚠️ 미완성 | Gemini 3.1, 3.2, 3.8 | • 200k 감시 코드 O • 모델 라우팅 O • 훅 미등록 ✗ |
| **Codex** | ⚠️ 미완성 | Luna, Sol, Astra | • 200k 감시 코드 O • 라우팅 O • 수집기 미실행 ✗ |

---

## 폴더 구조

```
token-router/
├── extension/
│   └── claude/                (Claude Code VSCode extension - 활성)
│       ├── src/
│       │   ├── extension.ts    상태표시줄 + Token Usage 패널
│       │   └── codexUsage.ts
│       └── dist/
├── claude/                    (Claude Code 스킬 ✅ 완성)
│   ├── handoff.js             200k 감시 + 자동 인수인계 파일
│   ├── route.js               작업 난도별 모델 추천
│   ├── state.js               라우팅 통계 + 로깅
│   ├── journal.js             세션 일지 자동 기록
│   ├── context-monitor.js     실시간 context 표시
│   ├── install.js             설치/업데이트 스크립트
│   ├── README.md              상세 사용법 및 설정
│   └── SKILL.md               Claude 작업 규칙
├── antigravity/               (Antigravity 스킬 ⚠️ 미완성)
│   ├── scripts/
│   │   ├── handoff.js         (구현됨)
│   │   ├── route.js           (구현됨)
│   │   └── state.js           (구현됨)
│   └── config.json            모델 매핑 (준비됨)
└── codex/                     (Codex 스킬 ⚠️ 미완성)
    ├── scripts/
    │   ├── hook.py            (구현됨)
    │   └── router.py          (구현됨)
    ├── dev-scripts/           테스트 & 유틸
    └── config.json            모델 매핑 (준비됨)
```

---

## 🚀 Claude Code (완성)

### 빠른 시작 (60초)

#### 1️⃣ 스킬 설치 (필수)

```bash
node claude/install.js
```

또는 Claude Code에 말하면:

> 이 폴더의 README 보고 token-router 설치해줘

**설치 후 Claude Code를 다시 시작하세요.**

#### 2️⃣ VSCode 익스텐션 설치 (선택)

VSCode에서 탭별 context를 실시간으로 보고 싶으면:

```bash
cd extension/claude
npm install
npm run compile
cp -r dist "$USERPROFILE/.vscode/extensions/token-router-indicator/"
```

**VSCode를 다시 시작한 뒤** Activity Bar(왼쪽)에 원형 아이콘이 나타나고, 패널에서 모든 Claude 탭의 context를 봅니다.

### 사용 예시

```
사용자: "이 엑셀 20개 읽어서..."
↓ (작업 진행 중)
↓ (맥락 80k 도달)
Claude: ⚠ 경고 (작업은 계속)
↓
↓ (맥락 200k 도달)
Claude: 📝 "인수인계 작성 중..."
Claude: (백업 + handoff 파일 작성)
↓ (자동 압축)
Claude: ▶ "압축 완료, 이어서 진행합니다"
Claude: (handoff 읽고 자동으로 이어감)
↓
사용자: "그 다음은..."
```

### 작동 방식

| 단계 | 맥락 크기 | 무엇이 일어나는가 |
|---|---|---|
| **경고** | 80k 초과 | ⚠ Windows 풍선·소리 알림. 작업은 계속 |
| **강제 작성** | 200k 초과 | 📝 Claude가 하던 작업만 마무리 → 파일 백업 → handoff 작성 |
| **자동 압축** | 자동 | ▶ 입력 잠금 없이 자동 압축 → handoff 자동 읽고 진행 |

**핵심:**
- 새 대화를 열 필요 없음 (같은 대화에서 계속)
- `/compact` 입력 필요 없음 (자동)
- 백업은 자동 (git 없이도 파일 복원 가능)

### 모델 전환 규칙

token-router는 **작업 난도**에 따라 자동으로 모델을 추천합니다. SIGNALS 패턴으로 판정합니다:

#### Haiku (조회, 확인, 요약)

**신호:**
- `검색|목록|나열|확인만|번역|뭐야|알려줘|보여줘`
- `where is|search|grep|list|locate|count|translate|what does|look up|show me`
- `찾아|읽어|요약|분류|설명해` (약한 신호)
- `이름 바꿔|리네임|포맷|format|오타|typo|주석 달`

**사용 조건:** 맥락 50k 이하, 명확한 판정

#### Sonnet (구현, 테스트, 수정)

**신호:**
- `구현|추가|만들어|엔드포인트|컴포넌트|테스트|타입 힌트|변환|리팩터|정리|개선|최적화|배포`
- `implement|add|build|feature|endpoint|component|update|tests|type hints|convert|bulk|refactor|clean up|improve|optimize|deploy`
- `수정|고쳐` (단순한 버그 수정)
- `스크립트|엑셀|csv|파싱|집계|계산`

**사용 조건:** 구현 범위가 명확함

#### Opus (설계, 원인 분석, 보안, 디버깅)

**신호:**
- `설계|아키텍처|구조|트레이드오프|고민|전략|계획|보안|취약|무결성|성능 분석|버그`
- `design|architecture|why|root cause|trade-offs|security|vulnerab|debug|performance analysis|bug`
- `왜 이렇|안 되|원인|근본|디버깅|가끔|재현`
- `애매|모호|확실하지 않|전체 리팩터|대규모`

**사용 조건:** 모호함, 깊이 필요, 대규모 변경

#### Fable (장시간 자동화)

**신호:**
- `몇 시간|장시간|밤새|끝까지 알아서|전부 다 만들어|처음부터 끝까지`
- `long-running|end to end|overnight|from scratch`

**사용 조건:** 여러 시간의 독립적 작업

### 모델 전환 방법

1. **훅이 질문을 막고 제안 표시**
   ```
   [token-router] 이 작업은 haiku / low 로 충분합니다 (현재 opus).
   → 바꾸기: /model 에서 haiku 선택 후 같은 질문을 다시 보내세요.
   ```

2. **`/model`에서 권장 모델 선택**

3. **같은 질문을 그대로 다시 입력 → 제안된 모델로 실행**

**같은 질문을 10분 안에 한 번 더 보내면** 제안을 무시하고 현재 모델로 진행합니다.

### 실시간 모니터링 (VSCode Extension)

**상태표시줄에서:**
- 현재 Claude 세션의 입력 토큰 + 맥락 백분율
- Codex 세션의 사용량 (연결된 경우)
- Antigravity 5h 쿼터 (실시간)

**Token Usage 패널:**
- 모든 열려 있는 Claude 탭 나열
- 각 탭의 context 크기 및 모델
- 추천 모델 표시

### 기본 명령

```bash
# 경고 기준 변경 (기본 80k)
node claude/handoff.js --threshold 60000

# 강제 작성 기준 변경 (기본 200k)
node claude/handoff.js --loop 150000

# 가장 최근 대화의 크기 확인
node claude/handoff.js check

# Windows 알림 끄기
node claude/handoff.js --toast off

# 모델 라우팅 통계
node claude/route.js --stats

# 모델 라우팅 켜기/끄기
node claude/route.js --on
node claude/route.js --off

# 하향 전환 제안 켜기/끄기
node claude/route.js --down on
node claude/route.js --down off

# 기본 모델 변경 (새 세션 판단용)
node claude/route.js --base haiku
```

---

## ⚠️ Antigravity (미완성)

상태: **코드 준비됨, 훅 미등록**

- ✓ 200k 자동 감시 기능 구현됨
- ✓ 모델 라우팅 구조 준비됨 (Gemini 3.1/3.2/3.8)
- ✗ Antigravity settings.json에 훅 미등록 → 아직 실행 안 됨

**다음 단계:**
Antigravity 설정에서 `handoff.js hook`, `route.js hook` 등록 필요

---

## ⚠️ Codex (미완성)

상태: **코드 준비됨, 수집기 미실행**

- ✓ 200k 자동 감시 기능 구현됨 (hook.py)
- ✓ 라우팅 로직 구현됨 (router.py)
- ✗ 수집기 미실행 → 사용량 데이터 없음 → hook 미동작

**다음 단계:**
1. Codex 수집기 시작: `D:\Skills\usage\codex\start.ps1`
2. Codex IDE에서 실제 hook 동작 확인

---

## handoff 저장 위치

- **파일을 수정한 대화**: 그 프로젝트 폴더의 `.handoff/` 에 저장
- **명령만 친 대화**: `D:\Claude_handoff` 에 저장 (변경 가능: `node claude/handoff.js --home <경로>`)

---

## 파일별 역할

| 파일 | 역할 |
|---|---|
| `handoff.js` | 맥락 크기 측정 + 80k/200k 알림 + 자동 인수인계 파일 생성 |
| `route.js` | 작업 난도 판정 + 최적 모델 추천 (SIGNALS 규칙 사용) |
| `state.js` | 라우팅 통계 + 로그 관리 |
| `journal.js` | 세션 일지 자동 기록 |
| `context-monitor.js` | 실시간 context 표시 (상태표시줄 & 터미널) |
| `snapshot.js` | handoff 직전 변경된 파일 자동 백업 |
| `install.js` | 설치·업데이트·제거 |
| `learn.js` | 사용자 피드백 학습 및 규칙 개선 |
| `SKILL.md` | Claude Code 작업 규칙 및 제약 사항 |

---

## 알려진 한계

- Windows 사용자명에 한글이 있으면 훅이 문제가 생길 수 있습니다. 그럴 때는 settings.json의 경로를 `D:/Skills/token-router/claude/...` 형태로 바꿔 보세요.
- Antigravity/Codex는 Claude Code 스킬 완성 후 차례대로 업그레이드 중입니다.

---

## 더 자세한 내용

더 자세한 규칙과 설정은 [`claude/README.md`](claude/README.md)를 읽으세요. Claude가 작업할 때 따르는 규칙들입니다.
