// Codex gate: when a prompt asks for implementation work, Claude may not edit files itself
// until a Codex/Antigravity delegation from this turn shows up in runs.jsonl with exit 0.
//   node codex_gate.js prompt   (UserPromptSubmit) — classify the prompt, open or clear the gate
//   node codex_gate.js tool     (PreToolUse Edit|Write|NotebookEdit) — deny while the gate is open
// Escape hatch: put [direct] in the prompt for small edits Claude should just make.
const fs = require("fs");
const os = require("os");
const path = require("path");

// Same verbs as core.py _STANDARD, minus test/bug words that also show up in plain questions
const IMPLEMENT = /구현|추가|만들|리팩터|수정|고쳐|implement|build|refactor|fix/i;
const DIRECT = /\[direct\]/i;
const STATE_DIR = path.join(os.tmpdir(), "model-router-gate");
const RUNS = path.join(__dirname, "runs.jsonl");
// Claude's own config, memory and scratch files are never Codex work
const EXEMPT = [path.join(os.homedir(), ".claude"), os.tmpdir()].map((p) => p.toLowerCase());

function statePath(sessionId) {
  return path.join(STATE_DIR, `${String(sessionId).replace(/[^\w-]/g, "")}.json`);
}

function delegatedSince(since) {
  let lines;
  try {
    lines = fs.readFileSync(RUNS, "utf8").trim().split("\n").slice(-50);
  } catch {
    return false;
  }
  return lines.some((line) => {
    try {
      const r = JSON.parse(line);
      return r.ts >= since && r.exit_code === 0;
    } catch {
      return false;
    }
  });
}

function onPrompt(input) {
  const file = statePath(input.session_id);
  const prompt = String(input.prompt || "");
  if (IMPLEMENT.test(prompt) && !DIRECT.test(prompt)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ since: Date.now() / 1000 }));
    process.stdout.write("[codex-gate] 구현 작업으로 분류됨: 파일 수정은 Agent(subagent_type=\"codex-run\")로 Codex에 위임한 뒤에만 열립니다. Claude는 명세 작성·검증·커밋 담당.");
  } else {
    fs.rmSync(file, { force: true });
  }
}

function onTool(input) {
  let state;
  try {
    state = JSON.parse(fs.readFileSync(statePath(input.session_id), "utf8"));
  } catch {
    return; // gate closed
  }
  const target = path.resolve(String(input.tool_input?.file_path || input.tool_input?.notebook_path || "")).toLowerCase();
  if (EXEMPT.some((dir) => target.startsWith(dir))) return;
  if (delegatedSince(state.since)) return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "[codex-gate] 이 턴은 구현 작업이라 Claude가 직접 수정할 수 없습니다. Agent(subagent_type=\"codex-run\")로 위임하세요. runs.jsonl에 exit 0 기록이 생기면 열립니다. 정말 작은 수정이면 사용자에게 [direct]를 붙여 다시 요청해 달라고 하세요.",
    },
  }));
}

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return;
  }
  (process.argv[2] === "prompt" ? onPrompt : onTool)(input);
});
