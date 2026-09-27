import importlib.util,os,pathlib,json,subprocess,sys,uuid
root=pathlib.Path('D:/Skills/token-router/codex')
test=pathlib.Path('D:/Skills/token-router/codex/validation/_Skills-validation')/('hooks-'+uuid.uuid4().hex)
test.mkdir(parents=True)
env={**os.environ,'TOKEN_ROUTER_STATE_DIR':str(test/'state'),'PYTHONUTF8':'1'}
def invoke(**kw):
 e=dict(session_id='fixture',hook_event_name='UserPromptSubmit',model='gpt-6-astra',prompt='search files',cwd=str(test));e.update(kw)
 r=subprocess.run([sys.executable,str(root/'scripts/hook.py')],input=json.dumps(e),capture_output=True,text=True,encoding='utf-8',env=env,check=True)
 return json.loads(r.stdout)
assert invoke()['decision']=='block'
assert 'decision' not in invoke(model='gpt-6-luna',effort='low')
assert 'decision' not in invoke(prompt='/router-continue search files')
assert 'decision' not in invoke(model=None)
assert invoke(model='gpt-6-luna',effort='high')['decision']=='block'
assert 'decision' not in invoke(model='gpt-6-luna',effort=None)
transcript=test/'transcript.jsonl'
transcript.write_text(json.dumps({'type':'event_msg','payload':{'type':'token_count','info':{'total_token_usage':{'input_tokens':999999},'last_token_usage':{'input_tokens':81000},'model_context_window':258400}}})+'\n',encoding='utf-8')
r=invoke(hook_event_name='Stop',transcript_path=str(transcript))
assert '81000' in r['systemMessage']
state=json.loads(next((test/'state').glob('*.json')).read_text(encoding='utf-8'))
assert state['context']==81000 and 'prompt' not in state
print('PASS: block, changed-model pass, override, unknown model/effort, effort mismatch, actual last input usage, no prompt persistence')
