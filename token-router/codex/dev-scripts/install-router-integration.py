import pathlib,json,shutil,datetime,sys
home=pathlib.Path.home()
root=pathlib.Path('D:/Skills/token-router/codex')
backup=pathlib.Path('D:/Skills/token-router/codex/backups')/('install-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S'))
backup.mkdir(parents=True)
config=home/'.codex/hooks.json'
data=json.loads(config.read_text(encoding='utf-8-sig')) if config.exists() else {}
if config.exists():shutil.copy2(config,backup/'hooks.json')
command='"'+sys.executable.replace('\\','/')+'" "D:/Skills/token-router/codex/scripts/hook.py"'
hooks=data.setdefault('hooks',{})
for event in ('UserPromptSubmit','SessionStart','Stop','PreCompact'):
 groups=hooks.setdefault(event,[])
 for g in groups:
  g['hooks']=[h for h in g.get('hooks',[]) if 'D:/Skills/token-router/codex/scripts/hook.py' not in h.get('command','')]
 groups[:]=[g for g in groups if g.get('hooks')]
 groups.append({'hooks':[{'type':'command','command':command,'timeout':10,'statusMessage':'Codex Token Router'}]})
config.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
source=pathlib.Path('D:/Claude_Skills/token-router/extension')
dest=home/'.vscode/extensions/token-router-indicator'
for rel in ('package.json','dist/extension.js'):
 p=dest/rel
 b=backup/'extension'/rel;b.parent.mkdir(parents=True,exist_ok=True)
 if p.exists():shutil.copy2(p,b)
 p.parent.mkdir(parents=True,exist_ok=True)
 shutil.copy2(source/rel,p)
skill=root/'SKILL.md'
s=skill.read_text(encoding='utf-8')
s=s.replace('이 설치에는 백그라운드 훅, 매 턴 자동 기록, 자동 모델 전환이나 새 세션 생성이 없다.',
'''## 자동 입력 분석과 확장
scripts/hook.py가 UserPromptSubmit에서 작업을 분류하고 실제 현재 모델과 비교한다. 불일치 시 입력을 차단하고 변경 안내를 표시한다. 사용자는 모델을 바꿔 다시 보내거나 /router-continue 접두어로 현재 설정을 유지할 수 있다.
SessionStart, Stop, PreCompact는 확장용 세션 상태와 마지막 입력 토큰을 갱신한다. 상태 파일은 ~/.codex/token-router/sessions에 있으며 요청 원문은 저장하지 않는다.
현재 effort는 훅 입력 또는 같은 turn_id의 transcript 값이 확인될 때만 비교한다. 확인되지 않은 값은 추정하지 않는다.
기존 Token Router Indicator 확장은 이 상태를 읽어 Codex 카드·상태 표시줄·차단 알림을 표시한다. 훅이 실행되기 전에는 데이터 대기로 표시한다.
Codex는 새 훅을 사용자 신뢰 처리 전까지 실행하지 않는다. 재시작 후 /hooks 또는 클라이언트의 훅 검토 UI에서 등록된 정의를 확인한다. 신뢰 저장소를 직접 수정하거나 보안 검토를 우회하지 않는다.
자동 모델 전환이나 새 세션 생성은 하지 않는다.''')
skill.write_text(s,encoding='utf-8')
print('Installed hooks: '+str(config))
print('Installed extension: '+str(dest))
print('Backups: '+str(backup))
