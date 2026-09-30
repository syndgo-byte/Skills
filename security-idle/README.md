# security-idle

> 마지막 업데이트: 2026년 10월 01일 05:03

자리를 비운 동안에만 보안 검사를 한 번 돌립니다. security-guidance 플러그인처럼 응답마다 돌지 않아 토큰이 적게 듭니다.

- Claude가 답을 마칠 때마다(Stop 훅) 대기를 시작하고, 15분 동안 다음 답이 없으면 검사합니다.
- 검사 대상은 그 대화에서 Claude가 Edit/Write로 고친 파일 중 지난 검사 이후 것입니다. git 저장소면 `git diff HEAD`, 아니면 파일 전체를 보냅니다.
- 고친 파일이 없으면 실행하지 않습니다. `.env`, `*.pem`/`*.key`, `auth.json`, 이름에 secret·credential·token이 들어간 설정 파일은 보내지 않습니다.
- 검사는 `claude -p --model sonnet`으로 돌립니다. 사용자 훅과 플러그인은 빼고(`--setting-sources project`), 도구는 모두 막습니다.
- 결과는 `~/.claude/security-idle/reports/`에 남습니다. 지적이 있으면 다음 질문을 보낼 때 한 번 알려 줍니다.

## 설치 (`~/.claude/settings.json`)

```json
"Stop": [{ "hooks": [{ "type": "command", "command": "node \"D:/Skills/security-idle/idle.js\" arm", "timeout": 5 }] }],
"UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "node \"D:/Skills/security-idle/idle.js\" notify", "timeout": 5 }] }]
```

기존 배열에 항목으로 추가합니다. 대기 시간은 환경 변수 `SECURITY_IDLE_MIN`(분)으로 바꿉니다.

## 수동 실행

```
node idle.js now     # 마지막으로 기록된 대화를 바로 검사
cat ~/.claude/security-idle/log.txt
```
