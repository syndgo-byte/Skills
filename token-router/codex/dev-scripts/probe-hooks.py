import subprocess,json,threading,queue,pathlib
exe=next((pathlib.Path.home()/'.vscode/extensions').glob('openai.chatgpt-26.917.62051-win32-x64/bin/windows-x86_64/codex.exe'))
p=subprocess.Popen([str(exe),'app-server','--stdio'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,encoding='utf-8')
q=queue.Queue()
threading.Thread(target=lambda:[q.put(l) for l in p.stdout],daemon=True).start()
def send(v):p.stdin.write(json.dumps(v)+'\n');p.stdin.flush()
def receive(id):
 for _ in range(100):
  e=json.loads(q.get(timeout=20))
  if e.get('id')==id:return e
try:
 send({'id':1,'method':'initialize','params':{'clientInfo':{'name':'token_router_verify','version':'1.0.0'},'capabilities':{'experimentalApi':True}}})
 r=receive(1)
 assert 'error' not in r,r
 send({'method':'initialized'})
 send({'id':2,'method':'hooks/list','params':{'cwds':['D:\\']}})
 r=receive(2)
 out=pathlib.Path('D:/Skills/token-router/codex/validation/hook-runtime-status.json')
 out.write_text(json.dumps(r,indent=2),encoding='utf-8')
 print(json.dumps(r))
finally:
 p.terminate()
 p.wait(timeout=10)
