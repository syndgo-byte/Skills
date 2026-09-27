import * as http from 'http';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export const PORT = 47821;
const PORT_FILE = path.join(os.homedir(), '.claude-permission-manager.port');
const MAX_BODY = 1024 * 1024;

export type Decision = 'allow' | 'deny';

export interface PendingRequest {
  id: string;
  toolName: string;
  summary: string;
  cwd: string;
  receivedAt: number;
}

function summarize(toolName: string, input: any): string {
  if (!input || typeof input !== 'object') return '';
  const direct = input.command ?? input.file_path ?? input.notebook_path ?? input.url ?? input.pattern ?? input.query;
  if (typeof direct === 'string') return direct;
  const json = JSON.stringify(input);
  return json.length > 400 ? json.slice(0, 400) + '…' : json;
}

export class PermissionServer implements vscode.Disposable {
  private server?: http.Server;
  private pending = new Map<string, { req: PendingRequest; res: http.ServerResponse }>();
  private counter = 0;
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.emitter.event;
  listening = false;

  start(): Promise<boolean> {
    return new Promise((resolve) => {
      const server = http.createServer((req, res) => this.handle(req, res));
      server.once('error', () => {
        fs.writeFileSync(PORT_FILE, String(PORT), 'utf8');
        resolve(false);
      });
      server.listen(PORT, '127.0.0.1', () => {
        this.server = server;
        this.listening = true;
        fs.writeFileSync(PORT_FILE, String(PORT), 'utf8');
        resolve(true);
      });
    });
  }

  list(): PendingRequest[] {
    return [...this.pending.values()].map((p) => p.req);
  }

  decide(ids: string[], decision: Decision) {
    if (decision !== 'allow' && decision !== 'deny') return;
    for (const id of ids) {
      const entry = this.pending.get(id);
      if (!entry) continue;
      this.pending.delete(id);
      entry.res.end(JSON.stringify({ decision }));
    }
    this.emitter.fire();
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse) {
    // Custom header forces a CORS preflight, so browser pages can't inject requests.
    if (req.method !== 'POST' || req.url !== '/permission' || req.headers['x-permission-manager'] !== '1') {
      res.statusCode = 404;
      res.end();
      return;
    }

    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY) req.destroy();
    });
    req.on('end', () => {
      let payload: any;
      try {
        payload = JSON.parse(body);
      } catch {
        res.statusCode = 400;
        res.end();
        return;
      }

      const id = String(++this.counter);
      const toolName = String(payload.tool_name ?? 'Unknown');
      this.pending.set(id, {
        req: {
          id,
          toolName,
          summary: summarize(toolName, payload.tool_input),
          cwd: String(payload.cwd ?? ''),
          receivedAt: Date.now(),
        },
        res,
      });
      res.setHeader('Content-Type', 'application/json');

      // Hook timed out or Claude Code cancelled the tool call.
      res.on('close', () => {
        if (this.pending.delete(id)) this.emitter.fire();
      });
      this.emitter.fire();
    });
  }

  dispose() {
    for (const { res } of this.pending.values()) res.end('{}');
    this.pending.clear();
    this.server?.close();
    this.emitter.dispose();
  }
}
