"""Router core. Quotas come exclusively from the Hub HTTP endpoint."""

from datetime import datetime, timezone
import glob
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
from urllib.request import urlopen
import uuid


TOOL_IDS = ("claude", "codex", "antigravity")


def fetch_quota(hub_url, opener=urlopen):
    try:
        with opener(hub_url.rstrip("/") + "/ai/tools", timeout=10) as response:
            return json.loads(response.read())
    except Exception as exc:
        return {"tools": [], "error": str(exc)}


def _iso_timestamp(value):
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.timestamp()


def assess(tool_id, quota, now, threshold):
    entry = next((item for item in quota.get("tools", [])
                  if item["id"] == tool_id), None)
    result = {"tool": tool_id, "available": True, "worst_pct": None,
              "reason": "한도 정보 없음(사용 가능으로 간주)"}
    if entry is None:
        return result
    # usage.used_pct is the session's context window, not a quota: only limits count
    values = [item.get("used_pct") for item in entry.get("limits", []) or []]
    values = [float(value) for value in values if value is not None]
    worst = max(values) if values else None
    result["worst_pct"] = worst
    reason = None
    if entry.get("paid") is False:
        reason = "유료 플랜 아님"
    elif entry.get("renews_at") and _iso_timestamp(entry["renews_at"]) < now:
        reason = "요금제 갱신일 지남"
    elif entry.get("status") != "ok":
        reason = f"상태 {entry.get('status')}"
    elif worst is not None and worst >= threshold:
        reason = f"한도 {worst}% ≥ {threshold}%"
    result.update(available=reason is None, reason=reason or "사용 가능")
    return result


def _model(tool_id, task_type, policy):
    config = policy.get("tools", {}).get(tool_id, {})
    if tool_id == "antigravity":
        return config.get("alt_models", {}).get(task_type, config.get("model"))
    return config.get("model")


def route(task_type, quota, policy, now=None):
    if task_type not in policy["roles"]:
        raise ValueError(f"알 수 없는 작업 유형: {task_type}")
    now = time.time() if now is None else now
    skipped = []
    for tool_id in policy["roles"][task_type]:
        assessment = assess(tool_id, quota, now, policy["quota_threshold_pct"])
        if assessment["available"]:
            return {"tool": tool_id, "model": _model(tool_id, task_type, policy),
                    "reason": assessment["reason"], "skipped": skipped}
        skipped.append({"tool": tool_id, "reason": assessment["reason"]})
    return {"tool": None, "model": None, "reason": "사용 가능한 도구 없음",
            "skipped": skipped}


def build_command(tool_id, prompt, cwd, model, policy):
    if tool_id == "claude":
        raise ValueError("claude는 호출자 자신이라 위임할 수 없습니다")
    if tool_id not in ("codex", "antigravity"):
        raise ValueError(f"알 수 없는 도구: {tool_id}")
    config = policy["tools"][tool_id]
    if config.get("exe_glob"):
        matches = glob.glob(os.path.expandvars(config["exe_glob"]))
        if not matches:
            raise FileNotFoundError(f"실행 파일 없음: {config['exe_glob']}")
        exe = max(matches, key=os.path.getmtime)
    else:
        exe = os.path.expandvars(config.get("exe") or shutil.which(tool_id) or tool_id)
    if tool_id == "codex":
        argv = [exe, "exec", "-C", str(cwd), "-s", "workspace-write"]
        if model:
            argv.extend(["-m", model])
        return argv + ["-"], prompt
    argv = [exe, "-p", prompt, "--mode", "accept-edits", "--add-dir", str(cwd)]
    if model:
        argv.extend(["--model", model])
    return argv, None


def _validate_cwd(cwd, policy):
    path = Path(cwd).resolve()
    if not path.is_dir():
        raise ValueError("cwd가 존재하는 디렉터리가 아닙니다")
    candidate = os.path.normcase(str(path))
    for root in policy["allowed_roots"]:
        allowed = os.path.normcase(str(Path(root).resolve()))
        try:
            if os.path.commonpath([candidate, allowed]) == allowed:
                return path
        except ValueError:
            pass
    raise ValueError("cwd가 allowed_roots 밖에 있습니다")


def _snapshot(quota, policy, timestamp):
    return {item["tool"]: item["worst_pct"]
            for item in status(quota, policy, timestamp)}


def _text(value):
    return value.decode("utf-8", errors="replace") if isinstance(value, bytes) else value or ""


def delegate(tool_id, prompt, cwd, task_type, policy, quota_fn,
             runner=subprocess.run, now=time.time):
    cwd = _validate_cwd(cwd, policy)
    if task_type not in policy["roles"]:
        raise ValueError(f"알 수 없는 작업 유형: {task_type}")
    model = _model(tool_id, task_type, policy)
    argv, stdin = build_command(tool_id, prompt, cwd, model, policy)
    before = _snapshot(quota_fn(), policy, now())
    started = now()
    run_id = uuid.uuid4().hex[:8]
    # Marker file lets observers (e.g. the plugin-manager extension) see in-flight runs.
    active = Path(policy["runs_log"]).parent / "active" / f"{run_id}.json"
    active.parent.mkdir(exist_ok=True)
    active.write_text(json.dumps({"run_id": run_id, "tool": tool_id, "task_type": task_type,
                                  "cwd": str(cwd), "started": started}, ensure_ascii=False),
                      encoding="utf-8")
    try:
        completed = runner(argv, input=stdin, cwd=str(cwd),
                           timeout=policy["timeout_sec"], encoding="utf-8",
                           errors="replace", capture_output=True)
        exit_code = completed.returncode
        output = _text(completed.stdout) + _text(completed.stderr)
    except subprocess.TimeoutExpired as exc:
        exit_code = -1
        output = _text(exc.stdout) + _text(exc.stderr) + "\n시간 초과 (timeout)"
    except OSError as exc:
        exit_code = -1
        output = f"실행 실패: {exc}"
    finally:
        active.unlink(missing_ok=True)
    duration = now() - started
    after = _snapshot(quota_fn(), policy, now())
    delta = (after[tool_id] - before[tool_id]
             if before[tool_id] is not None and after[tool_id] is not None else None)
    record = {"run_id": run_id, "ts": started,
              "task_type": task_type, "tool": tool_id, "model": model,
              "cwd": str(cwd), "duration_sec": duration, "exit_code": exit_code,
              "quota_before": before, "quota_after": after,
              "delta_pct": delta, "result": None}
    with Path(policy["runs_log"]).open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(record, ensure_ascii=False) + "\n")
    return {"run_id": record["run_id"], "exit_code": exit_code,
            "output": output[-4000:], "delta_pct": delta, "duration_sec": duration}


def _records(log_path):
    path = Path(log_path)
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()
            if line.strip()]


def record_result(run_id, tests_passed, review_issues, note, log_path):
    records = _records(log_path)
    result = {"tests_passed": tests_passed, "review_issues": review_issues, "note": note}
    for record in records:
        if record["run_id"] == run_id:
            record["result"] = result
            break
    else:
        raise ValueError(f"알 수 없는 run_id: {run_id}")
    Path(log_path).write_text("".join(json.dumps(row, ensure_ascii=False) + "\n"
                                     for row in records), encoding="utf-8")
    return {"run_id": run_id, "result": result}


def _average(values):
    values = [value for value in values if value is not None]
    return sum(values) / len(values) if values else None


def report(log_path):
    groups = {}
    for row in _records(log_path):
        groups.setdefault((row["tool"], row["task_type"]), []).append(row)
    summary = {}
    for (tool_id, task_type), rows in groups.items():
        results = [row.get("result") or {} for row in rows]
        summary.setdefault(tool_id, {})[task_type] = {
            "runs": len(rows),
            "avg_delta_pct": _average([row.get("delta_pct") for row in rows]),
            "avg_duration_sec": _average([row.get("duration_sec") for row in rows]),
            "pass_rate": _average([row.get("tests_passed") for row in results]),
            "avg_review_issues": _average([row.get("review_issues") for row in results]),
        }
    return summary


def status(quota, policy, now):
    return [assess(tool_id, quota, now, policy["quota_threshold_pct"])
            for tool_id in TOOL_IDS]
