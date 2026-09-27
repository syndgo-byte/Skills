# token-router

> **Claude Code · Antigravity · Codex** 에서 긴 대화를 **자동으로 끊고 정리해서 다음 세션으로 넘기는** 통합 토큰 관리 시스템

대화가 길어지면 토큰이 빠르게 줄어듭니다. token-router는 대화 맥락이 커지면:
- **80k**: 경고만 띄움 (계속 작업 가능)
- **200k**: 정리 후 handoff 파일 작성 (입력 잠금)
- **/compact**: 한 번 입력 → 자동으로 이어감 (새 대화 X)

**세 플랫폼 모두 동일하게 작동합니다:**
| 플랫폼 | 모델 | 기능 |
|---|---|---|
| **Claude Code** | Haiku, Sonnet, Opus, Fable | ✓ 200k 자동 감시, ✓ 실시간 모델 라우팅, ✓ VSCode 상태표시줄 |
| **Antigravity** | Gemini 3.1, 3.2, 3.8 | ✓ 200k 자동 감시, ✓ 실시간 모델 라우팅, ✓ 사용량 추적 |
| **Codex** | Luna, Sol, Astra | ✓ 200k 자동 감시, ✓ 라우팅 (light/standard/complex), ✓ 파일 백업 |

---

## 빠른 시작

### 설치 (60초)

이 폴더를 다운로드한 뒤 Claude Code 터미널에서:

```bash
node install.js
```

또는 Claude Code에 말하면:

> 이 폴더의 README 보고 token-router 설치해줘

설치 후 **VSCode를 다시 시작**하세요.

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
Claude: ✅ "완료. /compact 입력하세요"
사용자: ㄱㄱ  ← 또는 /c, /ㄱ, /compact
↓
Claude: ▶ "압축 완료, 이어서 진행합니다"
↓
사용자: "그 다음은..."
Claude: (handoff 읽고 자동으로 이어감)
```

---

## 작동 방식

| 단계 | 맥락 크기 | 무엇이 일어나는가 |
|---|---|---|
| **경고** | 80k 초과 | ⚠ Windows 풍선·소리 알림. 작업은 계속 |
| **강제 작성** | 200k 초과 | 📝 Claude가 하던 작업만 마무리 → 파일 백업 → handoff 작성 |
| **입력 잠금** | handoff 완료 후 | 🔒 이후 질문을 모두 막음. `/compact`(또는 `/c`, `/ㄱ`, `ㄱㄱ`) 입력 대기 |
| **압축 후 이어감** | /compact 입력 | ▶ 압축 완료 → 잠금 해제 → handoff 자동 읽고 진행 |

**핵심:**
- 새 대화를 열 필요 없음 (같은 대화에서 계속)
- `/compact` 한 번만 입력하면 자동으로 이어남
- 백업은 자동 (git 없이도 파일 복원 가능)

---

## 모델 라우팅

token-router는 작업 난도에 따라 자동으로 모델을 제안합니다. **각 플랫폼마다 다르게 작동합니다:**

### Claude Code (Haiku / Sonnet / Opus / Fable)

**상향 (Haiku → Sonnet/Opus)**
- 설계, 원인 분석, 보안 등 복잡한 작업이 들어오면 제안
- 맥락이 50k를 넘으면 제안하지 않음 (새 세션 권함)

**하향 (Opus/Sonnet → Haiku)** *Haiku 최대한 활용*
- 조회, 요약 같은 간단한 작업이면 하향 제안
- 조건: 명확한 판정 + 1단계 이상 아래 + 맥락 50k 이하

### Antigravity (Gemini 3.1 / 3.2 / 3.8)

**상향 (3.1 → 3.2 / 3.8)**
- 설계, 보안, 복잡한 분석
- 맥락이 50k를 넘으면 제안하지 않음

**하향 (3.8 / 3.2 → 3.1)**
- 조회, 요약, 간단한 변환
- 맥락 50k 이하

### Codex (Luna / Sol / Astra)

**Light (Luna)** - 조회, 검색, 번역, 요약
**Standard (Sol)** - 구현, 수정, 테스트, 변환
**Complex (Astra)** - 설계, 보안, 디버깅, 리팩터링

### 전환 방법

1. 훅이 질문을 막고 제안 표시 (또는 Codex에서 `[router-continue]` 접두사로 우회)
2. 모델/강도 변경
3. **같은 질문을 그대로** 다시 입력

**같은 질문을 10분 안에 한 번 더 보내면** 제안을 무시하고 현재 모델로 진행합니다 (Claude Code/Antigravity)

---

## 기본 명령

```bash
# 경고 기준 변경 (기본 80k)
node handoff.js --threshold 60000

# 강제 작성 기준 변경 (기본 200k)
node handoff.js --loop 150000

# 가장 최근 대화의 크기 확인
node handoff.js check

# Windows 알림 끄기
node handoff.js --toast off
```

---

## 설치 자세히

<details>
<summary><strong>Claude Code에게 맡기기 (권장)</strong></summary>

이 폴더에서:

```bash
node install.js
```

`install.js`가 하는 일:
1. 파일을 `~/.claude/skills/token-router/`에 복사
2. `~/.claude/settings.json`에 훅 6개 등록
3. 기존 token-router 훅은 자동으로 교체 (중복 없음)
4. 자가 점검 실행

옵션:
```bash
node install.js --dry-run      # 등록될 훅만 보기
node install.js --uninstall    # 훅 제거 (파일은 남음)
```

</details>

<details>
<summary><strong>수동 설치</strong></summary>

파일을 `~/.claude/skills/token-router/`에 복사한 뒤 `~/.claude/settings.json`에 아래 내용을 합칩니다. (경로는 본인 PC에 맞게)

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [
        { "type": "command", "command": "node \"C:/Users/이름/.claude/skills/token-router/handoff.js\" hook" }
      ] }
    ],
    "SessionStart": [
      { "hooks": [ { "type": "command", "command": "node \"C:/Users/이름/.claude/skills/token-router/handoff.js\" start" } ] }
    ],
    "PostToolUse": [
      { "matcher": "*", "hooks": [ { "type": "command", "command": "node \"C:/Users/이름/.claude/skills/token-router/handoff.js\" guard" } ] }
    ]
  }
}
```

</details>

---

## 파일

| 파일 | 역할 |
|---|---|
| `SKILL.md` | Claude가 읽는 규칙 (작업 계획, handoff 양식, 단계별 배정) |
| `handoff.js` | 맥락 크기 측정 + 80k/200k 알림 + /compact 후 이어가기 |
| `snapshot.js` | handoff 직전 변경된 파일 자동 백업 |
| `journal.js` | 작업 일지 자동 기록 |
| `install.js` | 설치·업데이트·제거 |

---

## handoff 저장 위치

- **파일을 수정한 대화**: 그 프로젝트 폴더에 저장
- **명령만 친 대화**: `D:\Claude_handoff`에 저장 (변경 가능: `node handoff.js --home <경로>`)

---

## 알려진 한계

- Windows 사용자명에 한글이 있으면 훅이 문제가 생길 수 있습니다. 그럴 때는 settings.json의 경로를 `~/.claude/skills/token-router/...` 형태로 바꿔 보세요.

---

## 자세한 내용

더 자세한 규칙과 설정은 [`SKILL.md`](SKILL.md)를 읽으세요. Claude가 작업할 때 따르는 규칙들입니다.
