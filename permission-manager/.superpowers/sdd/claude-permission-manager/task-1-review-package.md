# Task 1: Review Package

## Commit Log
```
507786b feat: scaffold VSCode extension project Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
```

## Diff Stats
```
 package.json               | 31 +++++++++++++++++++++++++++++++
 src/PermissionCollector.ts |  5 +++++
 src/WebviewProvider.ts     | 12 ++++++++++++
 src/extension.ts           | 23 +++++++++++++++++++++++
 src/types.ts               | 20 ++++++++++++++++++++
 tsconfig.json              | 15 +++++++++++++++
 6 files changed, 106 insertions(+)
```

## Full Diff

### package.json
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

### tsconfig.json
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

### src/types.ts
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

### src/extension.ts
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

### src/PermissionCollector.ts (stub)
```typescript
export class PermissionCollector {
  dispose() {}
}
```

### src/WebviewProvider.ts (stub)
```typescript
import * as vscode from 'vscode';
import { PermissionCollector } from './PermissionCollector';

export class WebviewProvider {
  constructor(context: vscode.ExtensionContext, collector: PermissionCollector) {}
  show() {}
}
```

