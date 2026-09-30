"""Antigravity PreInvocation hook: model advice and context warning. Local rules only.

Antigravity hooks cannot block a prompt or switch models, so the advice goes in as an
ephemeral message that the agent relays to the user. Each advice is given once per conversation.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import time

for stream in (sys.stdin, sys.stdout, sys.stderr):
    if hasattr(stream, 'reconfigure'):
        stream.reconfigure(encoding='utf-8')

CONFIG = json.loads((Path(__file__).resolve().parents[1] / 'config.json').read_text(encoding='utf-8-sig'))
STATE = Path(os.environ.get('TOKEN_ROUTER_STATE_DIR', str(Path.home() / '.gemini' / 'token-router')))
TAIL_BYTES = 2 * 1024 * 1024
CHARS_PER_TOKEN = 3  # rough: mixed Korean/English text


def tier_of(task):
    if re.search(r'설계|아키텍처|보안|취약|원인|디버깅|대규모|race condition|architecture|security|root cause|debug', task, re.I):
        return 'complex'
    if re.search(r'구현|추가|만들|테스트|변환|리팩터|수정|고쳐|버그|implement|build|test|refactor|fix|bug', task, re.I):
        return 'standard'
    if re.search(r'목록|검색|오타|번역|요약|list|search|typo|translate|summari', task, re.I):
        return 'light'
    return 'standard'


def read_transcript(path):
    """(last user request text, approximate context tokens)."""
    try:
        size = os.path.getsize(path)
        with open(path, 'rb') as f:
            f.seek(max(0, size - TAIL_BYTES))
            data = f.read()
    except OSError:
        return '', None
    last = ''
    for line in data.splitlines():
        try:
            row = json.loads(line)
        except (ValueError, UnicodeError):
            continue
        if row.get('type') == 'USER_INPUT' and row.get('content'):
            last = row['content']
    match = re.search(r'<USER_REQUEST>\s*(.*?)\s*</USER_REQUEST>', last, re.S)
    return (match.group(1) if match else last), size // CHARS_PER_TOKEN


def advise(event, state):
    """Messages not yet given in this conversation."""
    task, tokens = read_transcript(event.get('transcriptPath') or '')
    messages = []
    model = str(event.get('modelName') or '')
    if task and model and model != 'auto':
        tier = tier_of(task)
        target = CONFIG['models'][tier]
        digest = hashlib.sha256(task.encode()).hexdigest()[:12]
        if model != target['model'] and state.get('advised') != digest:
            state['advised'] = digest
            messages.append(f"[Token Router] 이 작업은 '{tier}' 난도로 보입니다. 현재 모델 {model} → 권장 "
                            f"{target['model']} (effort {target['effort']}). 사용자에게 모델 변경을 한 줄로 안내하세요.")
    for key, limit, text in (('warned80', CONFIG['context_warning'], '컨텍스트가 약 {n}k 토큰입니다. 새 대화로 넘길 준비를 하세요.'),
                             ('warned200', CONFIG['context_handoff'], '컨텍스트가 약 {n}k 토큰입니다. 지금까지 결과를 요약해 인수인계 파일을 작성하고 새 대화로 이어가도록 안내하세요.')):
        if tokens and tokens >= limit and not state.get(key):
            state[key] = True
            messages.append('[Token Router] ' + text.format(n=tokens // 1000))
    return messages, tokens


def main():
    event = json.load(sys.stdin)
    out = {}
    if event.get('conversationId'):
        STATE.mkdir(parents=True, exist_ok=True)
        file = STATE / (re.sub(r'[^0-9a-zA-Z-]', '', str(event['conversationId'])) + '.json')
        try:
            state = json.loads(file.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            state = {}
        messages, tokens = advise(event, state)
        state.update(model=event.get('modelName'), approx_tokens=tokens, updated=time.time())
        file.write_text(json.dumps(state, ensure_ascii=False), encoding='utf-8')
        if messages:
            out = {'injectSteps': [{'ephemeralMessage': m} for m in messages]}
    print(json.dumps(out, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:  # a hook must never break the agent loop
        print('{}')
        print(f'token-router hook: {exc}', file=sys.stderr)
