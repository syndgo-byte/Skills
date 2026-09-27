from pathlib import Path
import shutil,datetime
root=Path('D:/Skills/token-router/codex')
p=root/'scripts/hook.py'
backup=Path('D:/Skills/token-router/codex/backups')/('fix-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S'))
backup.mkdir(parents=True)
shutil.copy2(p,backup/'hook.py')
s=p.read_text(encoding='utf-8')
s=s.replace("import sys, json, os, hashlib, time","import sys, json, os, hashlib, time, re")
s=s.replace("HOME = Path(", "for stream in (sys.stdin, sys.stdout, sys.stderr):\n    if hasattr(stream, 'reconfigure'): stream.reconfigure(encoding='utf-8')\n\nHOME = Path(")
s=s.replace("bypass=task.startswith('/router-continue ')\n        if bypass: task=task[len('/router-continue '):]\n        if len(task)<12 and old.get('recommendation'):",
"""prefix=next((p for p in ('[router-continue] ', '/router-continue ') if task.startswith(p)),None)
        bypass=prefix is not None
        if prefix: task=task[len(prefix):]
        followup=bool(re.fullmatch(r'(응|네|예|계속|계속해|진행해|해줘|이어\\s*해|yes|ok|continue)[.!\\s]*',task,re.I))
        if followup and old.get('recommendation'):""")
s=s.replace("입력 앞에 /router-continue 를 붙이세요.","입력 앞에 [router-continue] 를 붙이세요.")
s=s.replace("'blocked':False}", "'blocked':False, 'effort_source':'current_turn' if effort else 'unknown'}")
s=s.replace("if event_name=='PreCompact':\n                output['hookSpecificOutput']", "if event_name=='PreCompact':\n                output['hookSpecificOutput']")
# PreCompact does not need to inject potentially unsupported hook-specific fields.
a=s.index("            if event_name=='PreCompact':\n                output['hookSpecificOutput']")
b=s.index("\n    tmp=file",a)
s=s[:a]+s[b:]
p.write_text(s,encoding='utf-8')
p=root/'SKILL.md';s=p.read_text(encoding='utf-8').replace('/router-continue 접두어','[router-continue] 접두어')
p.write_text(s,encoding='utf-8')
p=Path('D:/Claude_Skills/token-router/extension/src/extension.ts')
s=p.read_text(encoding='utf-8')
shutil.copy2(p,backup/'extension.ts')
s=s.replace("w.uri.fsPath.toLowerCase() + path.sep","w.uri.fsPath.toLowerCase().replace(/[\\\\\\\\/]+$/, '') + path.sep")
p.write_text(s,encoding='utf-8')
print('Fixed follow-up routing, UTF-8 streams, override marker, workspace-root matching')
