# token-router

> 마지막 업데이트: 2026년 10월 01일 05:00

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
| **Antigravity** | ⚠️ 미완성 | Gemini 3.8 Flash (Low, Medium, High) | • 컨텍스트 감시 O • 모델 권장 안내 O (PreInvocation 훅, `~/.gemini/config/hooks.json`) • 프롬프트 차단·자동 전환 ✗ (Antigravity 훅이 지원하지 않음) |
| **Codex** | ⚠️ 미완성 | Luna, Sol, Astra | • 프롬프트 차단형 모델 권장 O (`~/.codex/hooks.json` 등록됨) • 실제 세션에서 차단·권장 동작 확인 완료 (최초 1회 `codex` 실행 후 훅 검토에서 `t`로 승인 필요) |

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
│   ├── learn.js               신호 가중치 자동 최적화
│   ├── signals.json           신호 규칙 & 가중치 (동적 로드)
│   ├── install.js             설치/업데이트 스크립트
│   ├── README.md              상세 사용법 및 설정
│   └── SKILL.md               Claude 작업 규칙
├── data/                      (자동 학습 데이터)
│   ├── signals-log.jsonl      모든 라우팅 결정 기록 (타임스탐프, 신호, 점수, 결과)
│   └── signal-weights-history.json  신호 가중치 변경 이력 (시각, 변경값, 정확도, 이유)
├── antigravity/               (Antigravity 스킬 — hook.py 로 모델 권장·컨텍스트 경고)
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

token-router는 **작업 난도**에 따라 자동으로 모델을 추천합니다. SIGNALS 패턴으로 판정하며, **각 모델의 평균 신호 가중치**를 기준으로 강제 전환합니다:

#### Haiku (조회, 확인, 요약)

**신호 가중치:** 평균 2.75

| 신호 | 가중치 | 예시 |
|---|---|---|
| 조회/검색 | 3 | 검색, 목록, 나열, 몇 개, 확인만, 번역, 뭐야, 알려줘, 보여줘 |
| 영어 조회 | 3 | where is, search, grep, list, locate, count, translate, what does, look up, show me |
| 약한 신호 | 2 | 찾아, 읽어, 요약, 분류, 설명해 (다른 작업과 섞여있을 때만) |
| 이름/형식 | 3 | 이름 바꿔, 리네임, rename, 포맷, format, 오타, typo, 주석 달 |

**강제 전환:** margin ≥ 2 (맥락 크기 무관)

#### Sonnet (구현, 테스트, 수정)

**신호 가중치:** 평균 2.25 (Haiku와 Opus의 중간)

| 신호 | 가중치 | 예시 |
|---|---|---|
| 한글 구현 | 2 | 구현, 추가, 컴포넌트, 테스트, 타입 힌트, 리팩터, 정리, 개선, 최적화, 배포 |
| 영어 구현 | 3 | implement, add, build, feature, endpoint, component, update, tests, type hints, convert, bulk, refactor, clean up, improve, optimize, deploy |
| 버그 수정 | 2 | 수정, 고쳐, fix (원인이 명확한 경우만) |
| 데이터 처리 | 2 | 스크립트, 엑셀, CSV, 파싱, 집계, 합계, 계산, 정산 |

**강제 전환:** margin ≥ 2 (맥락 크기 무관)
**특징:** Opus 신호가 있으면 무시 (디버깅/설계 우선)

#### Opus (설계, 원인 분석, 보안, 디버깅)

**신호 가중치:** 평균 3.6

| 신호 | 가중치 | 예시 |
|---|---|---|
| 설계/보안 | 4 | 설계, 아키텍처, 구조, 트레이드오프, 어떤 방식, 고민, 전략, 계획, 보안, 취약, 무결성, 성능 분석, 버그 |
| 원인 분석 | 4 | 왜 이렇, 안 되, 왜 느려, 원인, 근본, 디버깅, 가끔, 재현 |
| 영어 고급 | 4 | design, architecture, why (does/is), root cause, trade-offs, which approach, strategy, security, vulnerab, race condition, deadlock, intermittent, flaky, debug, performance analysis, bug |
| 모호함 | 3 | 애매, 모호, 확실하지, 잘 모르, unclear, ambiguous, not sure |
| 대규모 | 3 | 전체 리팩터, 대규모, 여러 모듈, cross-cutting, large refactor, whole (app\|system) |

**강제 전환:** margin ≥ 2 (맥락 크기 무관)
**특징:** 가장 높은 가중치 (평균 3.6) → 한 신호만 있어도 강제

#### Fable (장시간 자동화)

**신호 가중치:** 평균 4.0

| 신호 | 가중치 | 예시 |
|---|---|---|
| 장시간 작업 | 4 | 몇 시간, 장시간, 밤새, 끝까지 알아서, 전부 다 만들어, 처음부터 끝까지, long-running, end to end, overnight, from scratch |

**강제 전환:** Fable 신호 감지 시 (allow-fable 플래그 활성화된 경우)
**특징:** 사용 가능 여부를 명시적으로 제어 (`node route.js --fable on`)

### 강제 전환 기준 (Margin Rule)

**핵심:** 최상위 모델 점수 - 2위 모델 점수 **≥ 2**

```
예시 1: Haiku 신호 명확
  task: "이 파일 검색해줘"
  scores: { haiku: 3, sonnet: 0, opus: 0, fable: 0 }
  margin: 3 - 0 = 3 ≥ 2 → ✓ Haiku 강제 추천

예시 2: Opus 신호 약함
  task: "뭐가 문제일까"
  scores: { haiku: 0, sonnet: 0, opus: 3, fable: 0 }
  margin: 3 - 0 = 3 ≥ 2 → ✓ Opus 강제 추천

예시 3: 모호함 (강제 없음)
  task: "이 코드를 더 좋게 만들어줘"
  scores: { haiku: 0, sonnet: 2, opus: 1, fable: 0 }
  margin: 2 - 1 = 1 < 2 → ✗ 기본값(Sonnet) 사용, 제안 없음
```

---

## 🤖 Auto-Learning System (자동 학습)

token-router는 **매시간마다** 실제 라우팅 결정을 분석해서 신호 가중치를 자동으로 조정합니다.

### 작동 흐름

```
✅ 매 질문마다
   └─ route.js: 신호 점수 계산 + signals-log.jsonl 기록

✅ VSCode 켤 때마다  
   └─ SessionStart: learn.js start (준비 메시지)

✅ 매시간 정각 :07분
   └─ CronCreate: learn.js --apply
      ├─ 지난 1시간 데이터 분석
      ├─ 신호별 정확도 계산
      └─ signals.json 자동 업데이트

✅ Noise Filtering (진동 방지)
   ├─ 7일 쿨다운 (같은 신호 재조정 금지)
   ├─ 70% 정확도 이상만 (낮은 신뢰도 무시)
   └─ 3회 이상 일관성 (한두 번 실수로 조정 X)
```

### 학습 메커니즘

1. **데이터 수집** (`signals-log.jsonl`)
   - 모든 라우팅 결정 기록: 타임스탐프, 신호, 점수, 선택 모델, 결과

2. **신호별 정확도 계산** (hourly)
   - "opus: 설계" 신호 → 실제 Opus로 갔나? → 정확도 계산
   - "haiku: 검색" 신호 → 실제 Haiku로 갔나? → 정확도 계산

3. **가중치 조정 (신뢰도 높을 때만)**
   - 정확도 70% 이상 + 7일 이내 미조정 + 3회 이상 히트 → 가중치 ±0.5 조정
   - 변경 이력: `signal-weights-history.json` 에 타임스탐프 + 이유 기록

4. **signals.json 자동 업데이트**
   - 모든 가중치 조정이 즉시 반영 → route.js가 동적으로 로드

### 설정 값 (claude/learn.js)

```javascript
const CONFIG = {
  lookbackHours: 1,        // 1시간 데이터 분석
  accuracyThreshold: 0.70, // 70% 이상 정확도만 반영
  minHits: 3,              // 최소 3회 히트 필요
  cooldownDays: 7,         // 7일 쿨다운
  maxWeightChange: 0.5,    // 한 번에 ±0.5만 조정
};
```

### 수동 확인

```bash
# learn.js 상태 확인
node claude/learn.js start

# 지난 1시간 데이터 분석 및 제안 보기
node claude/learn.js --apply

# 신호별 가중치 변경 이력 확인
cat ../data/signal-weights-history.json
```

### 모델 전환 방법

1. **훅이 질문을 막고 제안 표시** (margin ≥ 2일 때만)
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
- ✓ 모델 라우팅 구조 준비됨 (Gemini 3.8 Flash Low/Medium/High)
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
| `route.js` | 작업 난도 판정 + 최적 모델 추천 (signals.json 규칙 사용) |
| `signals.json` | 신호 패턴 & 가중치 (정규식 + 점수) — learn.js가 시간마다 자동 조정 |
| `state.js` | 라우팅 통계 + 로그 관리 |
| `journal.js` | 세션 일지 자동 기록 |
| `context-monitor.js` | 실시간 context 표시 (상태표시줄 & 터미널) |
| `learn.js` | 신호 가중치 자동 최적화 (시간 단위 분석 + 정확도 기반 조정) |
| `snapshot.js` | handoff 직전 변경된 파일 자동 백업 |
| `install.js` | 설치·업데이트·제거 |
| `SKILL.md` | Claude Code 작업 규칙 및 제약 사항 |
| **data/** | 자동 학습 데이터 (signals-log.jsonl + signal-weights-history.json) |

---

## 알려진 한계

- Windows 사용자명에 한글이 있으면 훅이 문제가 생길 수 있습니다. 그럴 때는 settings.json의 경로를 `D:/Skills/token-router/claude/...` 형태로 바꿔 보세요.
- Antigravity/Codex는 Claude Code 스킬 완성 후 차례대로 업그레이드 중입니다.

---

## 더 자세한 내용

더 자세한 규칙과 설정은 [`claude/README.md`](claude/README.md)를 읽으세요. Claude가 작업할 때 따르는 규칙들입니다.
