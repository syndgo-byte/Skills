// PreToolUse hook (matcher: Agent): a subagent named after Codex/Antigravity must actually delegate.
// Without this, Claude subagents labelled "Codex: ..." did the work themselves and the session
// reported it as Codex work.
let raw = '';
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  let input = {};
  try { input = JSON.parse(raw).tool_input || {}; } catch { return; }
  const label = `${input.description || ''} ${input.name || ''}`;
  if (!/\b(codex|antigravity|agy)\b/i.test(label)) return;
  // Real delegation: the model-router MCP tool, or the CLI run directly by a thin wrapper.
  if (/mcp__model-router__delegate|delegate\(|codex(\.exe)?["']?\s+exec|agy(\.exe)?["']?\s+-p/i.test(input.prompt || '')) return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: '이름에 Codex/Antigravity가 들어간 서브에이전트는 실제로 '
        + 'mcp__model-router__delegate를 호출해야 합니다. prompt에 delegate 호출 지시를 넣거나, '
        + 'Claude가 직접 하는 작업이면 이름에서 Codex/Antigravity를 빼세요.',
    },
  }));
});
