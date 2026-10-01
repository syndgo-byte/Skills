import io
import json
from pathlib import Path
import subprocess
from types import SimpleNamespace

import pytest

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import core, server


def quota(tool="codex", pct=10, **fields):
    entry = {"id": tool, "paid": True, "status": "ok", "limits": [{"used_pct": pct}],
             "usage": {"used_pct": 999}}
    entry.update(fields)
    return {"tools": [entry]}


@pytest.fixture
def policy(tmp_path):
    result = json.loads((Path(core.__file__).parent / "policy.json").read_text())
    result.update(allowed_roots=[str(tmp_path)], runs_log=str(tmp_path / "runs.jsonl"))
    result["tools"]["codex"] = {"exe": "fake-codex", "model": None}
    result["tools"]["antigravity"]["exe"] = "fake-agy"
    return result


@pytest.mark.parametrize("fields,reason", [
    ({"paid": False}, "유료 플랜 아님"),
    ({"renews_at": "2000-01-01T00:00:00Z"}, "요금제 갱신일 지남"),
    ({"status": "offline"}, "상태 offline"),
    ({"limits": [{"used_pct": None}, {"used_pct": 90}]}, "한도 90.0% ≥ 85%"),
    ({"limits": [{"used_pct": 85}]}, "한도 85.0% ≥ 85%"),
])
def test_assess_unavailable(fields, reason):
    result = core.assess("codex", quota(**fields), 1700000000, 85)
    assert result["available"] is False
    assert result["reason"] == reason


def test_assess_missing_and_empty_limits():
    result = core.assess("claude", {"tools": []}, 0, 85)
    assert result == {"tool": "claude", "available": True, "worst_pct": None,
                      "reason": "한도 정보 없음(사용 가능으로 간주)"}
    result = core.assess("claude", quota("claude", None), 0, 85)
    assert result["available"] and result["worst_pct"] is None


def test_assess_dates_and_usage_max():
    # Offset and fractional ISO timestamps denote the same instant.
    assert core._iso_timestamp("2023-11-15T07:13:20.000+09:00") == 1700000000
    assert core.assess("codex", quota(renews_at="2023-11-14T22:13:20Z"),
                       1700000000, 85)["available"]
    assert core.assess("codex", quota(pct=80, limits=[{"used_pct": 20}]),
                       0, 85)["worst_pct"] == 20  # context usage (999) is ignored
    assert core.assess("claude", quota("claude", limits=[]), 0, 85)["available"]


def test_route(policy):
    assert core.route("implement", {"tools": []}, policy, now=0)["tool"] == "codex"
    result = core.route("implement", quota(pct=95), policy, now=0)
    assert result["tool"] == "antigravity"
    assert result["skipped"] == [{"tool": "codex", "reason": "한도 95.0% ≥ 85%"}]
    exhausted = {"tools": [quota(tool, 100)["tools"][0] for tool in core.TOOL_IDS]}
    result = core.route("review", exhausted, policy, now=0)
    assert result["tool"] is None and result["model"] is None
    assert result["reason"] == "사용 가능한 도구 없음"
    assert result["skipped"] == [{"tool": "codex", "reason": "한도 100.0% ≥ 85%"}]
    # design falls back to antigravity, which serves design on its alt model
    result = core.route("design", quota("codex", 95), policy, now=0)
    assert result["tool"] == "antigravity" and result["model"] == "claude-sonnet-4-6"
    with pytest.raises(ValueError):
        core.route("unknown", {}, policy)


def test_commands(policy, tmp_path):
    cwd = str(tmp_path)
    command, stdin = core.build_command("codex", "hello", cwd, None, policy)
    assert command == ["fake-codex", "exec", "--skip-git-repo-check", "-C", cwd, "-s", "workspace-write", "-"]
    assert stdin == "[router-continue] hello"
    modeled, _ = core.build_command("codex", "hello", cwd, "custom", policy)
    assert modeled[-3:] == ["-m", "custom", "-"]
    agy, stdin = core.build_command("antigravity", "hello", cwd, "gemini", policy)
    assert agy == ["fake-agy", "-p", "hello", "--mode", "accept-edits",
                   "--add-dir", cwd, "--model", "gemini"]
    assert stdin is None
    assert all("dangerously" not in arg for arg in command + agy + modeled)
    with pytest.raises(ValueError, match="호출자 자신"):
        core.build_command("claude", "hello", cwd, None, policy)


def test_exe_glob_newest_and_expansion(policy, monkeypatch):
    policy["tools"]["codex"] = {"exe_glob": "%LOCALAPPDATA%/bin/*/codex.exe"}
    monkeypatch.setattr(core.os.path, "expandvars", lambda value: value.replace("%LOCALAPPDATA%", "expanded"))
    def fake_glob(pattern):
        assert pattern == "expanded/bin/*/codex.exe"
        return ["old.exe", "new.exe"]
    monkeypatch.setattr(core.glob, "glob", fake_glob)
    monkeypatch.setattr(core.os.path, "getmtime", lambda path: 2 if path == "new.exe" else 1)
    assert core.build_command("codex", "hi", ".", None, policy)[0][0] == "new.exe"
    monkeypatch.setattr(core.glob, "glob", lambda pattern: [])
    with pytest.raises(FileNotFoundError):
        core.build_command("codex", "hi", ".", None, policy)


def test_delegate_invalid_cwd(policy, tmp_path):
    def forbidden(*args, **kwargs):
        pytest.fail("No I/O permitted for invalid cwd")
    for cwd in (tmp_path.parent, tmp_path / "missing"):
        with pytest.raises(ValueError):
            core.delegate("codex", "hello", cwd, "implement", policy, forbidden, forbidden)


def test_delegate_log(policy, tmp_path):
    snapshots = iter([quota(pct=10), quota(pct=17)])
    ticks = iter([100, 101, 106, 107])
    def runner(argv, **kwargs):
        assert argv[0] == "fake-codex"
        marker, = (tmp_path / "active").glob("*.json")
        assert json.loads(marker.read_text(encoding="utf-8"))["tool"] == "codex"
        assert kwargs == {"input": "[router-continue] hello", "cwd": str(tmp_path.resolve()),
                          "timeout": 900, "encoding": "utf-8", "errors": "replace",
                          "capture_output": True}
        return SimpleNamespace(returncode=0, stdout="x" * 5000, stderr="tail")
    result = core.delegate("codex", "hello", tmp_path, "implement", policy,
                           lambda: next(snapshots), runner, lambda: next(ticks))
    assert result["delta_pct"] == 7 and result["duration_sec"] == 5
    assert result["output"] == "x" * 3996 + "tail"
    row = json.loads(Path(policy["runs_log"]).read_text(encoding="utf-8"))
    assert row["run_id"] == result["run_id"] and len(row["run_id"]) == 8
    assert row["quota_before"]["codex"] == 10
    assert row["quota_after"]["codex"] == 17
    assert row["result"] is None and row["delta_pct"] == 7
    assert not list((tmp_path / "active").glob("*.json"))


def test_delegate_hook_block_is_failure(policy, tmp_path):
    def runner(argv, **kwargs):
        return SimpleNamespace(returncode=0, stdout="hook: UserPromptSubmit Blocked\n", stderr="")
    result = core.delegate("codex", "hello", tmp_path, "test", policy,
                           lambda: {"tools": []}, runner)
    assert result["ok"] is False and result["exit_code"] == 2


def test_delegate_timeout(policy, tmp_path):
    def runner(argv, **kwargs):
        raise subprocess.TimeoutExpired(argv, 900, output=b"partial", stderr=b"error")
    result = core.delegate("codex", "hello", tmp_path, "test", policy,
                           lambda: {"tools": []}, runner, lambda: 100)
    assert result["exit_code"] == -1
    assert "partialerror" in result["output"] and "timeout" in result["output"]
    assert result["delta_pct"] is None
    row = json.loads(Path(policy["runs_log"]).read_text(encoding="utf-8"))
    assert row["exit_code"] == -1


def test_record_and_report(tmp_path):
    path = tmp_path / "runs.jsonl"
    assert core.report(path) == {}
    rows = [
        {"run_id": "a", "tool": "codex", "task_type": "test", "delta_pct": 2,
         "duration_sec": 10, "result": None},
        {"run_id": "b", "tool": "codex", "task_type": "test", "delta_pct": 4,
         "duration_sec": 20, "result": None},
        {"run_id": "c", "tool": "codex", "task_type": "test", "delta_pct": None,
         "duration_sec": 30, "result": None},
        {"run_id": "d", "tool": "antigravity", "task_type": "review", "result": None},
    ]
    path.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")
    core.record_result("a", True, 0, "좋음", path)
    core.record_result("b", False, 4, None, path)
    summary = core.report(path)
    assert summary["codex"]["test"] == {"runs": 3, "avg_delta_pct": 3,
        "avg_duration_sec": 20, "pass_rate": 0.5, "avg_review_issues": 2}
    assert summary["antigravity"]["review"] == {"runs": 1, "avg_delta_pct": None,
        "avg_duration_sec": None, "pass_rate": None, "avg_review_issues": None}
    saved = path.read_text(encoding="utf-8")
    assert json.loads(saved.splitlines()[0])["result"]["note"] == "좋음"
    with pytest.raises(ValueError):
        core.record_result("unknown", None, None, None, path)
    assert path.read_text(encoding="utf-8") == saved


def test_fetch_quota():
    def failure(*args, **kwargs):
        raise OSError("offline")
    assert core.fetch_quota("http://fake", failure) == {"tools": [], "error": "offline"}
    def opener(url, timeout):
        assert url == "http://fake/ai/tools" and timeout == 10
        return io.BytesIO(b'{"tools": []}')
    assert core.fetch_quota("http://fake/", opener) == {"tools": []}
    assert "error" in core.fetch_quota("http://fake", lambda *a, **kw: io.BytesIO(b"invalid"))


def test_server_wrappers(policy, monkeypatch):
    monkeypatch.setattr(server, "_policy", lambda: policy)
    monkeypatch.setattr(core, "fetch_quota", lambda url: quota())
    assert server.route("implement")["tool"] == "codex"
    assert len(server.status()) == 3
    assert server.report() == {}
    def fake_delegate(tool, prompt, cwd, task_type, passed_policy, quota_fn):
        assert (tool, prompt, cwd, task_type) == ("codex", "hi", ".", "test")
        assert passed_policy == policy and quota_fn() == quota()
        return {"run_id": "fake"}
    monkeypatch.setattr(core, "delegate", fake_delegate)
    assert server.delegate("codex", "hi", ".", "test") == {"run_id": "fake"}


def test_tiers(policy, tmp_path):
    assert core.classify_tier("보안 취약점 원인 분석") == "complex"
    assert core.classify_tier("버그 수정") == "standard"
    assert core.classify_tier("오타 목록") == "light"
    assert core.classify_tier("hello") == "standard"
    real = json.loads((Path(core.__file__).parent / "policy.json").read_text(encoding="utf-8"))
    assert core.resolve_model("codex", "implement", real, "light") == ("gpt-6-luna", "low")
    assert core.resolve_model("codex", "implement", real, "complex") == ("gpt-6-astra", "high")
    assert core.resolve_model("antigravity", "implement", real, "complex")[0] == "gemini-3.8-flash-high"
    assert core.resolve_model("antigravity", "review", real, "complex") == ("claude-sonnet-4-6", None)
    argv, _ = core.build_command("codex", "x", str(tmp_path), "gpt-6-astra", real, "high")
    assert argv[-3:] == ["-c", 'model_reasoning_effort="high"', "-"] and "-m" in argv
    with pytest.raises(ValueError, match="난도"):
        core.delegate("codex", "x", tmp_path, "test", policy, lambda: {"tools": []}, tier="huge")


def test_token_router_config_overrides_and_falls_back(tmp_path):
    real = json.loads((Path(core.__file__).parent / "policy.json").read_text(encoding="utf-8"))
    real["token_router_dir"] = str(tmp_path)  # not installed: policy tiers apply
    assert core.resolve_model("codex", "implement", real, "light") == ("gpt-6-luna", "low")
    (tmp_path / "codex").mkdir()
    (tmp_path / "codex" / "config.json").write_text(json.dumps(
        {"models": {"light": {"model": "shared-model", "effort": "high"}}}), encoding="utf-8")
    assert core.resolve_model("codex", "implement", real, "light") == ("shared-model", "high")
    (tmp_path / "codex" / "config.json").write_text("not json", encoding="utf-8")
    assert core.resolve_model("codex", "implement", real, "light") == ("gpt-6-luna", "low")
