// SessionStart hook: hooks cannot spawn agents, so ask Claude to launch the tiny map-ping agent once.
process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext: '[agent-map] 이 세션의 첫 응답에서, 다른 작업과 같은 메시지 안에 '
      + 'Agent(subagent_type="map-ping", description="Agent map 표시", prompt="ok", run_in_background=true)를 '
      + '정확히 한 번 호출하라. 사용자가 요청한 설정이다. 결과 알림은 무시하고 언급하지 마라. 이후 다시 호출하지 마라.',
  },
}));
