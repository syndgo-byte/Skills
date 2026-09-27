import * as fs from 'fs';
export interface CodexUsage {
  id: string; model: string | null; effort: string | null;
  context_tokens: number | null; context_window: number | null;
  context_percent: number | null; stale: boolean; log_updated_at: string;
}
export function readCodexUsage(): CodexUsage | null {
  try {
    const data = JSON.parse(fs.readFileSync('D:/Skills/usage/codex/usage.json', 'utf8'));
    const session = (data.sessions || []).find((s: any) => typeof s.context_tokens === 'number');
    if (!session) return null;
    return {...session, stale: Date.now() - Date.parse(data.updated_at) > 15000};
  } catch { return null; }
}
