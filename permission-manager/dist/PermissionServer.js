"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PermissionServer = exports.PORT = void 0;
const http = __importStar(require("http"));
const vscode = __importStar(require("vscode"));
exports.PORT = 47821;
const MAX_BODY = 1024 * 1024;
function summarize(toolName, input) {
    if (!input || typeof input !== 'object')
        return '';
    const direct = input.command ?? input.file_path ?? input.notebook_path ?? input.url ?? input.pattern ?? input.query;
    if (typeof direct === 'string')
        return direct;
    const json = JSON.stringify(input);
    return json.length > 400 ? json.slice(0, 400) + '…' : json;
}
class PermissionServer {
    constructor() {
        this.pending = new Map();
        this.counter = 0;
        this.emitter = new vscode.EventEmitter();
        this.onDidChange = this.emitter.event;
        this.listening = false;
    }
    start() {
        return new Promise((resolve) => {
            const server = http.createServer((req, res) => this.handle(req, res));
            server.once('error', () => resolve(false));
            server.listen(exports.PORT, '127.0.0.1', () => {
                this.server = server;
                this.listening = true;
                resolve(true);
            });
        });
    }
    list() {
        return [...this.pending.values()].map((p) => p.req);
    }
    decide(ids, decision) {
        if (decision !== 'allow' && decision !== 'deny')
            return;
        for (const id of ids) {
            const entry = this.pending.get(id);
            if (!entry)
                continue;
            this.pending.delete(id);
            entry.res.end(JSON.stringify({ decision }));
        }
        this.emitter.fire();
    }
    handle(req, res) {
        // Custom header forces a CORS preflight, so browser pages can't inject requests.
        if (req.method !== 'POST' || req.url !== '/permission' || req.headers['x-permission-manager'] !== '1') {
            res.statusCode = 404;
            res.end();
            return;
        }
        let body = '';
        req.on('data', (chunk) => {
            body += chunk;
            if (body.length > MAX_BODY)
                req.destroy();
        });
        req.on('end', () => {
            let payload;
            try {
                payload = JSON.parse(body);
            }
            catch {
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
                if (this.pending.delete(id))
                    this.emitter.fire();
            });
            this.emitter.fire();
        });
    }
    dispose() {
        for (const { res } of this.pending.values())
            res.end('{}');
        this.pending.clear();
        this.server?.close();
        this.emitter.dispose();
    }
}
exports.PermissionServer = PermissionServer;
