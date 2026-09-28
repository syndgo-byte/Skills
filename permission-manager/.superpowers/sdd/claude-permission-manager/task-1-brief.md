# Task 1: Extension Scaffold & Base Setup

**Context:** This is the foundation task for a VSCode extension that centralizes permission approvals from all VSCode extensions. You are creating the project skeleton, configuration files, and entry point.

**Requirements:**

**Files to create:**
- `package.json` — VSCode extension manifest with exact metadata below
- `tsconfig.json` — TypeScript compiler configuration
- `src/extension.ts` — Extension entry point (activate/deactivate functions)
- `src/types.ts` — Shared TypeScript interfaces

**package.json — use verbatim:**

```json
{
  "name": "vscode-permission-manager",
  "displayName": "Permission Manager",
  "description": "Centralized permission approval for VSCode extensions",
  "version": "0.1.0",
  "publisher": "user",
  "engines": {
    "vscode": "^1.85.0"
  },
  "categories": ["Other"],
  "activationEvents": ["onStartupFinished"],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "permissionManager.open",
        "title": "Open Permission Manager"
      }
    ]
  },
  "scripts": {
    "compile": "tsc",
    "watch": "tsc -w",
    "package": "vsce package"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/vscode": "^1.85.0",
    "typescript": "^5.3.0"
  }
}
```

**tsconfig.json — use verbatim:**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "**/*.test.ts"]
}
```

**src/types.ts — exact interfaces (used by Task 2 & 4):**

```typescript
export interface Permission {
  id: string;
  extensionId: string;
  extensionName: string;
  name: string;
  description: string;
  timestamp: number;
  applied: boolean;
}

export interface ExtensionConfig {
  extensionId: string;
  extensionName: string;
  settingsKey: string; // e.g., "claude.permissions.allowed"
}

export interface WebviewMessage {
  type: 'getPermissions' | 'approveAll' | 'denyAll' | 'approveSingle' | 'statusUpdate';
  data?: any;
}
```

**src/extension.ts — structure (will be called by Task 5's integration):**

```typescript
import * as vscode from 'vscode';
import { PermissionCollector } from './PermissionCollector';
import { WebviewProvider } from './WebviewProvider';

let collector: PermissionCollector;
let webviewProvider: WebviewProvider;

export function activate(context: vscode.ExtensionContext) {
  console.log('Permission Manager activated');

  collector = new PermissionCollector();
  webviewProvider = new WebviewProvider(context, collector);

  const openCmd = vscode.commands.registerCommand('permissionManager.open', () => {
    webviewProvider.show();
  });

  context.subscriptions.push(openCmd);
}

export function deactivate() {
  collector?.dispose();
}
```

**Global Constraints (binding for all tasks):**
- VSCode 1.85+
- TypeScript 5.0+
- All permissions handled per-extension independently
- Settings modifications only at workspace level (never user settings)

**Deliverables:**
1. All four files created at correct paths
2. `npm install` completes without errors
3. `npm run compile` succeeds (outputs to `dist/extension.js`)
4. Project structure ready for Tasks 2–5

**Test command (run after completing all steps):**
```bash
npm run compile
ls dist/extension.js  # should exist
```

**Report to:** D:\Skills\UnityAgree\.superpowers\sdd\claude-permission-manager\task-1-report.md

