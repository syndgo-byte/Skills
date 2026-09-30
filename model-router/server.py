"""Thin MCP stdio entry point; importing does not require the MCP SDK."""

import json
from pathlib import Path
import time

if __package__:
    from . import core
else:
    import core


def _policy():
    directory = Path(__file__).resolve().parent
    policy = json.loads((directory / "policy.json").read_text(encoding="utf-8"))
    policy["runs_log"] = str(directory / policy["runs_log"])
    return policy


def route(task_type: str, tier: str | None = None):
    policy = _policy()
    return core.route(task_type, core.fetch_quota(policy["hub_url"]), policy, tier=tier)


def delegate(tool: str, prompt: str, cwd: str, task_type: str, tier: str | None = None):
    """tier: light | standard | complex. Omitted, it is inferred from the prompt."""
    policy = _policy()
    extra = {"tier": tier} if tier else {}
    return core.delegate(tool, prompt, cwd, task_type, policy,
                         quota_fn=lambda: core.fetch_quota(policy["hub_url"]), **extra)


def status():
    policy = _policy()
    return core.status(core.fetch_quota(policy["hub_url"]), policy, time.time())


def record_result(run_id: str, tests_passed: bool | None = None,
                  review_issues: int | None = None, note: str | None = None):
    return core.record_result(run_id, tests_passed, review_issues, note, _policy()["runs_log"])


def report():
    return core.report(_policy()["runs_log"])


def main():
    try:  # mcp 2.x renamed FastMCP to MCPServer
        from mcp.server.mcpserver import MCPServer as Server
    except ImportError:
        from mcp.server.fastmcp import FastMCP as Server

    server = Server("model-router")
    for function in (route, delegate, status, record_result, report):
        server.tool()(function)
    server.run(transport="stdio")


if __name__ == "__main__":
    main()
