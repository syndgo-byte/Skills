"""Codex synchronous prompt gate and extension telemetry. Local rules only."""
import sys, json, os, hashlib, time
from pathlib import Path
from router import route, CONFIG

HOME = Path(os.environ.get('CODEX_HOME', str(Path.home()/'.codex')))
STATE = Path(os.environ.get('TOKEN_ROUTER_STATE_DIR', str(HOME/'token-router'/'sessions')))

def transcript_info(filename, turn_id):
    result = {'context': None, 'window': None, 'effort': None}
    if not filename:
        return result
    try:
        with open(filename, 'rb') as f:
            f.seek(0, 2); size=f.tell(); start=max(0,size-2*1024*1024)
            f.seek(start); data=f.read()
        if start: data=data.split(b'\n',1)[-1]
        for line in data.splitlines():
            try: e=json.loads(line)
            except (ValueError, UnicodeError): continue
            p=e.get('payload',{})
            if e.get('type')=='turn_context' and turn_id and p.get('turn_id')==turn_id:
                result['effort']=p.get('effort') or p.get('reasoning_effort')
            if e.get('type')=='event_msg' and p.get('type')=='token_count':
                info=p.get('info') or {}
                result['context']=(info.get('last_token_usage') or {}).get('input_tokens')
                result['window']=info.get('model_context_window')
    except OSError: pass
    return result

def process(event):
    STATE.mkdir(parents=True,exist_ok=True)
    sid=str(event.get('session_id') or 'unknown')
    key=hashlib.sha256(sid.encode()).hexdigest()[:24]
    file=STATE/(key+'.json')
    try: old=json.loads(file.read_text(encoding='utf-8'))
    except (OSError,ValueError): old={}
    info=transcript_info(event.get('transcript_path'),event.get('turn_id'))
    effort=event.get('reasoning_effort') or event.get('effort') or info['effort']
    model=event.get('model')
    event_name=event.get('hook_event_name')
    state={**old,'id':sid,'cwd':event.get('cwd'),'model':model,'effort':effort,
           'context':info['context'],'window':info['window'],'updated':time.time(),
           'event':event_name,'blocked':False}
    output={}
    if event_name=='UserPromptSubmit':
        prompt=str(event.get('prompt') or '')
        # IDE attachments must not determine task complexity.
        task=prompt.rsplit('## My request:',1)[-1].strip()
        bypass=task.startswith('/router-continue ')
        if bypass: task=task[len('/router-continue '):]
        if len(task)<12 and old.get('recommendation'):
            recommendation=old['recommendation']
        else: recommendation=route(task)
        state['recommendation']=recommendation
        target=recommendation['model']
        mismatch=bool(model and (model!=target or (effort and effort!=recommendation['effort'])))
        if mismatch and not bypass:
            reason='Token Router: 현재 '+str(model)+' / '+str(effort or '강도 미확인')+' → 권장 '+target+' / '+recommendation['effort']+'. 모델·강도를 변경한 뒤 다시 보내세요. 현재 설정을 유지하려면 입력 앞에 /router-continue 를 붙이세요.'
            state.update(blocked=True,message=reason)
            output={'decision':'block','reason':reason,'systemMessage':reason}
        else:
            state['message']='현재 설정 유지 (사용자 선택)' if bypass else '라우팅 통과' if model else '현재 모델 미확인: 차단하지 않음'
    elif event_name in ('PreCompact','Stop'):
        n=info['context']
        if event_name=='PreCompact' or (isinstance(n,(int,float)) and n>=CONFIG['context_warning']):
            state['message']='인수인계 권장: 마지막 입력 '+str(n if n is not None else '미확인')+' tokens'
            output={'systemMessage':state['message']}
            if event_name=='PreCompact':
                output['hookSpecificOutput']={'hookEventName':'PreCompact','additionalContext':'Codex token-router: 핵심 결정, 완료/미완료, 파일 경로와 검증 결과를 인수인계 파일에 보존하세요. 기존 작업을 계속하세요.'}
    tmp=file.with_suffix('.'+str(os.getpid())+'.tmp')
    tmp.write_text(json.dumps(state,ensure_ascii=False),encoding='utf-8')
    os.replace(tmp,file)
    return output

if __name__=='__main__':
    try:
        print(json.dumps(process(json.load(sys.stdin)),ensure_ascii=False))
    except Exception as e:
        print(json.dumps({'systemMessage':'Token Router 실행 오류: '+str(e)},ensure_ascii=False))
