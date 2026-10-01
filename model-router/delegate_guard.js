// SubagentStop hook: a codex-run / map-ping subagent may not finish without actually calling delegate.
// An LLM wrapper can answer by itself ("pong", or do the work with its own tools) and still be labelled Codex;
// this checks its transcript instead of trusting its words.
const fs = require("fs");

const GUARDED = new Set(["codex-run", "map-ping"]);

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return;
  }
  if (!GUARDED.has(input.agent_type)) return;

  let transcript = "";
  try {
    transcript = fs.readFileSync(input.agent_transcript_path, "utf8");
  } catch {
    return; // nothing to check against; do not block on our own failure
  }
  const called = transcript.split("\n").some((line) => {
    try {
      const content = JSON.parse(line).message?.content;
      return Array.isArray(content) && content.some((c) => c.type === "tool_use" && c.name === "mcp__model-router__delegate");
    } catch {
      return false;
    }
  });
  if (called) return;

  if (input.stop_hook_active) {
    // second refusal: let it stop, but say so plainly so the caller does not take the reply as Codex output
    process.stdout.write(JSON.stringify({ systemMessage: `${input.agent_type}: delegate 미호출 — Codex가 실행되지 않았습니다. 응답을 Codex 결과로 쓰지 마세요.` }));
    return;
  }
  process.stdout.write(JSON.stringify({
    decision: "block",
    reason: "mcp__model-router__delegate를 호출하지 않았습니다. 직접 답하지 말고 ToolSearch로 delegate를 불러와 정확히 한 번 호출한 뒤 그 결과만 보고하세요.",
  }));
});
