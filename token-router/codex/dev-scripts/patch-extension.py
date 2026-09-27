import pathlib,json,shutil,datetime
root=pathlib.Path('D:/Claude_Skills/token-router/extension')
p=root/'src/extension.ts'
backup=pathlib.Path('D:/Skills/token-router/codex/backups')/datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
backup.mkdir(parents=True,exist_ok=True)
shutil.copy2(p,backup/'extension.ts')
shutil.copy2(root/'package.json',backup/'package.json')
s=p.read_text(encoding='utf-8')
insert="""
// --- Codex hook telemetry (no prompt contents are stored) ---
interface CodexStatus {
  id: string; cwd?: string; model?: string; effort?: string;
  context: number | null; window: number | null; updated: number;
  blocked: boolean; message?: string;
  recommendation?: { model: string; effort: string };
}
let statusBarCodex: vscode.StatusBarItem;
const codexNotices = new Map<string, number>();
function scanCodex(): CodexStatus[] {
  const dir = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'token-router', 'sessions');
  try {
    return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as CodexStatus; }
      catch { return null; }
    }).filter((s): s is CodexStatus => !!s && Number.isFinite(s.updated) &&
      Date.now() / 1000 - s.updated < 86400 &&
      (!vscode.workspace.workspaceFolders?.length || vscode.workspace.workspaceFolders.some(w =>
        !!s.cwd && (path.resolve(s.cwd).toLowerCase() === w.uri.fsPath.toLowerCase() ||
        path.resolve(s.cwd).toLowerCase().startsWith(w.uri.fsPath.toLowerCase() + path.sep)))))
      .sort((a, b) => b.updated - a.updated);
  } catch { return []; }
}
"""
s=s.replace('// --- Status Bar Items ---',insert+'\n// --- Status Bar Items ---')
s=s.replace('  // Status bar items','  statusBarCodex = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 102);\n  statusBarCodex.command = "token-router.showPanel";\n  context.subscriptions.push(statusBarCodex);\n\n  // Status bar items')
s=s.replace('  scanClaudeTranscripts();','''  const codexSessions = scanCodex();
  const cx = codexSessions[0];
  if (cx) {
    statusBarCodex.text = (cx.blocked ? '$(warning)' : '$(hubot)') + ' Codex ' + (cx.context == null ? '?' : fmt(cx.context));
    statusBarCodex.tooltip = (cx.model || '모델 미확인') + ' / ' + (cx.effort || '강도 미확인') + '\\n' + (cx.message || '') + '\\n마지막 입력 토큰 · 세션 ' + cx.id;
    statusBarCodex.color = cx.blocked ? '#f97316' : undefined;
    statusBarCodex.show();
    if (cx.blocked && Date.now()/1000 - cx.updated < 30 && codexNotices.get(cx.id) !== cx.updated) {
      codexNotices.set(cx.id, cx.updated);
      void vscode.window.showWarningMessage(cx.message || 'Codex 모델 변경 권장');
    }
  } else { statusBarCodex.hide(); }
  scanClaudeTranscripts();''')
s=s.replace('webviewProvider.post({ agySession, claudeTabs });','webviewProvider.post({ agySession, claudeTabs, codexSessions });')
s=s.replace('claudeTabs: TabStatus[] }','claudeTabs: TabStatus[]; codexSessions: CodexStatus[] }')
s=s.replace('{ agySession: null, claudeTabs: [] }','{ agySession: null, claudeTabs: [], codexSessions: [] }')
s=s.replace("      let html = '';","""      const esc = value => String(value == null ? '?' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      let html = '';
      html += '<div class="section-title">Codex</div>';
      if (!data.codexSessions || !data.codexSessions.length) {
        html += '<div class="card sub">훅 데이터 대기 · Codex에서 새 훅 신뢰 후 입력하세요.</div>';
      }
      (data.codexSessions || []).forEach(c => {
        html += '<div class="card"><div class="title">' + esc(c.model) + ' / ' + esc(c.effort) + '</div>';
        html += '<div class="ctx">' + esc(c.context) + '</div><div class="sub">마지막 입력 토큰 / 컨텍스트 한도 ' + esc(c.window) + '</div>';
        html += '<div class="sub">' + esc(c.message || '대기') + '</div>';
        if (c.recommendation) html += '<div class="sub">권장: ' + esc(c.recommendation.model) + ' / ' + esc(c.recommendation.effort) + '</div>';
        html += '<div class="sub">세션 ' + esc(c.id) + ' · ' + esc(new Date(c.updated * 1000).toLocaleTimeString()) + '</div></div>';
      });""")
s=s.replace("        html = '<div style=", "        html += '<div style=")
p.write_text(s,encoding='utf-8')
pkg=json.loads((root/'package.json').read_text(encoding='utf-8'))
pkg['version']='1.1.0'
pkg['description']='Claude, Antigravity and Codex usage and routing indicator'
(root/'package.json').write_text(json.dumps(pkg,ensure_ascii=False,indent=2),encoding='utf-8')
print('Extension source updated; backup: '+str(backup))
