# Antigravity Token Router

> Google Antigravity 에이전트를 위한 **토큰 최적화 및 스마트 모델/서브에이전트 라우팅 스킬**

긴 대화에서 발생하는 컨텍스트 비대화를 막고, 작업 난이도에 따라 가장 효율적인 모델(Gemini Flash Lite / Flash / Pro) 및 서브에이전트를 동적으로 배정하여 토큰을 절약합니다.

---

## 주요 기능

1. **지능형 모델 & 서브에이전트 라우팅 (`route.js`)**:
   - 질문과 작업의 복잡도를 분석하여 적절한 모델(Flash Lite / Flash / Pro) 및 Thinking Effort를 추천합니다.
   - 대규모 탐색/조사 시 메인 대화창 컨텍스트를 보호하기 위해 `research` 또는 `self` 서브에이전트(`flash`)를 자동 권장합니다.
2. **세션 인수인계 (`handoff.js`)**:
   - 대화가 길어지거나 독립된 새 작업으로 전환할 때 `handoff-MMDD-HHmm.md` 문서를 생성하여 새 세션이 이전 맥락을 최소 토큰으로 바로 이어받을 수 있게 합니다.
3. **자동 스냅샷 백업 (`snapshot.js`)**:
   - Handoff 전 프로젝트의 수정된 파일들을 `backup-antigravity/`에 gzip 압축 백업하여 git 커밋 없이도 안전하게 롤백을 보장합니다.
4. **대용량 파일 스크립트 처리**:
   - 엑셀, CSV, 방대한 로그 파일 내용을 대화창에 통째로 읽어들이지 않고, Python/Node 스크립트로 처리하여 결과 요약만 반환합니다.

---

## 폴더 구조

```text
D:\Antigravity_Skills\token-router\
├── SKILL.md                 # Antigravity 스킬 정의 파일 (규칙 및 행동 지침)
├── README.md                # 사용 가이드 문서
└── scripts\
    ├── route.js             # 작업 난도별 Gemini 모델 및 서브에이전트 추천 스크립트
    ├── handoff.js           # Handoff 문서 템플릿 및 경로 관리
    ├── snapshot.js          # 프로젝트 변경 파일 압축 백업 스크립트
    └── state.js             # 토큰 라우터 상태 및 기본 설정
```

---

## 사용 방법

- **모델/에이전트 추천 확인**:
  ```bash
  node D:\Antigravity_Skills\token-router\scripts\route.js "작업 내용 설명"
  ```
- **Handoff 파일명 생성**:
  ```bash
  node D:\Antigravity_Skills\token-router\scripts\handoff.js name
  ```
- **프로젝트 백업 스냅샷 실행**:
  ```bash
  node D:\Antigravity_Skills\token-router\scripts\snapshot.js
  ```
