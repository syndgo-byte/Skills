#!/usr/bin/env node
// Claude Code PermissionRequest hook: waits for a decision from the Permission Manager sidebar.
// Reads port from ~/.claude-permission-manager.port (shared across VSCode windows).
// Exits silently (normal dialog) when the extension isn't running.
const http = require('http');
const fs = require('fs');
const path = require('path');

const portFile = path.join(require('os').homedir(), '.claude-permission-manager.port');
let port = 47821;
try {
  port = parseInt(fs.readFileSync(portFile, 'utf8'), 10) || 47821;
} catch {}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (input += chunk));
process.stdin.on('end', () => {
  const req = http.request(
    {
      host: '127.0.0.1',
      port: port,
      path: '/permission',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Permission-Manager': '1' },
    },
    (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const { decision } = JSON.parse(body);
          if (decision === 'allow' || decision === 'deny') {
            const out = { behavior: decision };
            if (decision === 'deny') out.message = 'Denied from Permission Manager sidebar';
            process.stdout.write(
              JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: out } })
            );
          }
        } catch {}
        process.exit(0);
      });
    }
  );
  req.on('error', () => process.exit(0));
  req.end(input);
});
