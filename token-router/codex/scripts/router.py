"""Local Codex helpers. No network, runtime hooks or model switching."""
import argparse
from datetime import datetime
import gzip
import hashlib
import json
from pathlib import Path
import re
from uuid import uuid4

CONFIG = json.loads((Path(__file__).resolve().parents[1] / 'config.json').read_text(encoding='utf-8-sig'))

def stamp():
    return datetime.now().strftime('%Y%m%d-%H%M%S') + '-' + uuid4().hex[:8]

def route(task):
    if re.search(r'설계|아키텍처|보안|취약|원인|디버깅|대규모|race condition|architecture|security|root cause|debug', task, re.I):
        tier = 'complex'
    elif re.search(r'구현|추가|만들|테스트|변환|리팩터|수정|고쳐|버그|implement|build|test|refactor|fix|bug', task, re.I):
        tier = 'standard'
    elif re.search(r'목록|검색|오타|번역|요약|list|search|typo|translate|summari', task, re.I):
        tier = 'light'
    else:
        tier = 'standard'
    return dict(tier=tier, **CONFIG['models'][tier], advisory_only=True, availability='verify_in_current_session')

def handoff(project):
    out = project / ('handoff-' + stamp() + '.md')
    headings = ['목표', '완료', '다음 단계', '파일·스크립트', '미완료·주의', '결정 사항', '검증 방법', '다음 세션 권장 모델']
    out.write_text('# Codex handoff\n\n' + '\n\n'.join('## ' + h + '\n- 작성 필요' for h in headings) + '\n', encoding='utf-8')
    return {'path': str(out), 'status': 'template_requires_completion'}

def snapshot(project, files):
    selected, skipped, total = [], [], 0
    for name in sorted(set(files)):
        rel = Path(name)
        source = project / rel
        reason = None
        if rel.is_absolute() or '..' in rel.parts or not source.resolve().is_relative_to(project):
            reason = 'outside_project'
        elif any(p.lower() in {'.git', '.handoff', 'node_modules', '.venv', 'backup-claude', 'backup-codex'} for p in rel.parts):
            reason = 'excluded_directory'
        elif any(project.joinpath(*rel.parts[:i]).is_symlink() or project.joinpath(*rel.parts[:i]).is_junction() for i in range(1, len(rel.parts) + 1)):
            reason = 'link'
        elif re.search(r'(^\.env($|\.)|secret|credential|^id_(rsa|ed25519)|\.(pem|key|p12|pfx|keystore)$)', rel.name, re.I):
            reason = 'sensitive_filename'
        elif not source.is_file():
            reason = 'missing_or_deleted'
        elif source.stat().st_size > CONFIG['max_file_mb'] * 1024**2:
            reason = 'file_size_limit'
        if reason:
            skipped.append({'file': name, 'reason': reason})
            continue
        total += source.stat().st_size
        if total > CONFIG['max_snapshot_mb'] * 1024**2:
            raise ValueError('Snapshot size limit exceeded; select fewer files')
        selected.append((name, source))
    out = project / '.handoff' / 'backups' / stamp()
    out.mkdir(parents=True)
    manifest = {'project': str(project), 'files': [], 'skipped': skipped, 'complete': False}
    try:
        for name, source in selected:
            target = out / (name + '.gz')
            target.parent.mkdir(parents=True, exist_ok=True)
            digest = hashlib.sha256()
            with source.open('rb') as src, gzip.open(target, 'wb') as dest:
                for chunk in iter(lambda: src.read(1024 * 1024), b''):
                    digest.update(chunk)
                    dest.write(chunk)
            manifest['files'].append({'file': name, 'sha256': digest.hexdigest()})
        manifest['complete'] = True
    finally:
        (out / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    return {'path': str(out), **manifest}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('route').add_argument('task')
    sub.add_parser('check').add_argument('--context-tokens', type=int)
    for command in ('handoff', 'journal', 'snapshot'):
        p = sub.add_parser(command)
        p.add_argument('--project', required=True)
        if command == 'journal':
            p.add_argument('--message', required=True)
        if command == 'snapshot':
            p.add_argument('--files', nargs='+', required=True)
    args = parser.parse_args()
    if args.command == 'route':
        result = route(args.task)
    elif args.command == 'check':
        n = args.context_tokens
        if n is not None and n < 0:
            parser.error('context tokens must be nonnegative')
        result = {'context_tokens': n, 'source': 'unknown' if n is None else 'caller_provided',
                  'recommend': 'unknown' if n is None else 'handoff' if n >= CONFIG['context_handoff'] else 'review' if n >= CONFIG['context_warning'] else 'keep'}
    else:
        project = Path(args.project).resolve()
        if not project.is_dir():
            raise ValueError('Project directory does not exist')
        if args.command == 'handoff':
            result = handoff(project)
        elif args.command == 'snapshot':
            result = snapshot(project, args.files)
        else:
            out = project / '.handoff' / ('journal-' + datetime.now().strftime('%Y%m%d') + '.md')
            out.parent.mkdir(exist_ok=True)
            with out.open('a', encoding='utf-8') as f:
                f.write('\n## ' + datetime.now().isoformat(timespec='seconds') + '\n' + args.message + '\n')
            result = {'path': str(out)}
    print(json.dumps(result, ensure_ascii=False))

if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError) as e:
        raise SystemExit(str(e))
