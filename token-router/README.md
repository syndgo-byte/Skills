# token-router

Claude Code에서 긴 대화를 자동으로 정리하고 모델을 지능적으로 선택하는 스킬입니다.

## 기능

| 기능 | 설명 |
|---|---|
| **Handoff** | 200k 도달 시 자동 정리 후 다음 세션으로 이어감 (입력 잠금 없음) |
| **모델 라우팅** | 작업 난도에 따라 Haiku/Sonnet/Opus 자동 제안 |
| **Auto-learning** | 사용자 불만 감지 → 신호 가중치 자동 조정 |
| **Context 모니터링** | VSCode에서 실시간 토큰 사용량 표시 |

## 설치 (60초)

```bash
node install.js
```

Claude Code를 재시작하세요. 이제 모든 기능이 자동으로 작동합니다.

**VSCode 사용자 (선택사항):**
```bash
cd extension && npm install && npm run compile
cp -r dist "$USERPROFILE/.vscode/extensions/token-router-indicator/"
```

## 작동 방식

### Handoff (200k 도달)

```
대화 시작 → ... → 200k 도달
↓
📝 자동 정리 + handoff 파일 작성
↓
✅ 자동 압축 후 그대로 이어감
```

- 80k: 경고만 띄움 (계속 작업 가능)
- 200k: 자동 정리 + handoff

### 모델 선택

**Haiku**: 검색, 읽기, 정보 조회
**Sonnet**: 구현, 테스트, 데이터 작업
**Opus**: 버그 분석, 설계, 아키텍처

자동 제안되면 `/model haiku` 등으로 변경할 수 있습니다.

### Auto-learning

매 세션마다 자동 분석:
1. 과거 대화에서 불만 감지 ("아니", "엉뚱", "틀렸" 등)
2. 해당 신호 약화 (3개 이상 불만 시)
3. 검증 후 자동 적용

**보고서 확인:**
```bash
node learn.js 30              # 수동 실행
cat ~/.claude/token-router/learn-report.json
```

## 명령어

```bash
# 경고 기준 변경 (기본 80k)
node handoff.js --threshold 60000

# Handoff 기준 변경 (기본 200k)
node handoff.js --loop 150000

# 가장 최근 대화 크기 확인
node handoff.js check

# 모델 신호 테스트 (13개 대표 요청)
node route.test.js

# 자동 학습 분석
node learn.js 30
```

## 파일

| 파일 | 역할 |
|---|---|
| `route.js` | 모델 라우팅 로직 (신호 가중치) |
| `handoff.js` | 200k 자동 정리 |
| `learn.js` | 대화 분석 + 신호 자동 조정 |
| `context-monitor.js` | VSCode 토큰 표시 |
| `route.test.js` | 신호 검증 |

## 자세한 내용

- `route.js`: 신호 정의와 가중치 조정 방법
- `SKILL.md`: Skill 기능 설명
- `learn-report.json`: 자동 학습 분석 결과

## 라이선스

MIT
