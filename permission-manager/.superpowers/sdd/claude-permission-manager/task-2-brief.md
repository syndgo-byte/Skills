# Task 2: PermissionCollector Implementation

**Context:** Task 1 completed (scaffold). Now you are implementing the core permission monitoring and collection layer. This component watches all VSCode extension settings for permission requests and emits updates to the Webview (Task 3) and PermissionApplier (Task 4).

**Depends on:** Task 1 (types.ts, extension.ts structure)

**Files to create/modify:**
- Create: `src/PermissionCollector.ts` — Main permission collector class
- Create: `test/PermissionCollector.test.ts` — Unit tests
- Modify: `src/extension.ts` — Initialize PermissionCollector (already done in Task 1, verify)

**PermissionCollector class — exact implementation:**

```typescript
import * as vscode from 'vscode';
import { Permission, ExtensionConfig } from './types';

const KNOWN_EXTENSIONS: ExtensionConfig[] = [
  {
    extensionId: 'anthropic.claude',
    extensionName: 'Claude',
    settingsKey: 'claude.permissions'
  },
  {
    extensionId: 'ms-python.python',
    extensionName: 'Python',
    settingsKey: 'python.linting'
  }
  // Can extend with more extensions
];

export class PermissionCollector {
  private _onPermissionsChanged = new vscode.EventEmitter<Permission[]>();
  public onPermissionsChanged = this._onPermissionsChanged.event;

  private permissionsMap: Map<string, Permission> = new Map();
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.startWatching();
  }

  private startWatching() {
    // Listen for configuration changes
    const configListener = vscode.workspace.onDidChangeConfiguration(() => {
      this.refreshPermissions();
    });

    this.disposables.push(configListener);
    this.refreshPermissions();
  }

  private async refreshPermissions() {
    const newPermissions = new Map<string, Permission>();

    // Claude extension permissions
    const claudePerms = await this.collectClaudePermissions();
    claudePerms.forEach(p => newPermissions.set(p.id, p));

    this.permissionsMap = newPermissions;
    this._onPermissionsChanged.fire(Array.from(newPermissions.values()));
  }

  private async collectClaudePermissions(): Promise<Permission[]> {
    const config = vscode.workspace.getConfiguration('claude');
    const perms = config.get('permissions', {}) as any;
    const deniedPerms = perms.denied || {};

    const result: Permission[] = [];
    for (const [name, count] of Object.entries(deniedPerms)) {
      if (typeof count === 'number' && count > 0) {
        result.push({
          id: `claude:${name}`,
          extensionId: 'anthropic.claude',
          extensionName: 'Claude',
          name,
          description: `Grant ${name} permission to Claude Code`,
          timestamp: Date.now(),
          applied: false
        });
      }
    }
    return result;
  }

  public async getPermissions(): Promise<Permission[]> {
    return Array.from(this.permissionsMap.values());
  }

  public dispose() {
    this.disposables.forEach(d => d.dispose());
  }
}
```

**Test file (test/PermissionCollector.test.ts):**

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';
import { PermissionCollector } from '../src/PermissionCollector';

suite('PermissionCollector', () => {
  let collector: PermissionCollector;

  setup(() => {
    collector = new PermissionCollector();
  });

  teardown(() => {
    collector.dispose();
  });

  test('should initialize with empty permissions', async () => {
    const perms = await collector.getPermissions();
    assert.strictEqual(Array.isArray(perms), true);
  });

  test('should emit change event on permission update', (done) => {
    const subscription = collector.onPermissionsChanged((perms) => {
      assert.strictEqual(Array.isArray(perms), true);
      subscription.dispose();
      done();
    });
  });
});
```

**Global Constraints (binding):**
- VSCode 1.85+
- TypeScript 5.0+
- Settings monitoring only (read workspace config, never write)
- All permissions collected by extension ID

**Deliverables:**
1. `src/PermissionCollector.ts` fully implemented with the exact class above
2. `test/PermissionCollector.test.ts` with basic tests
3. Both files compile without TypeScript errors
4. Tests can be run (even if they need VSCode test harness to fully run)
5. One git commit: "feat: implement PermissionCollector for monitoring extensions"

**Test command (after completing):**
```bash
npm run compile
# Verify no TypeScript errors
```

**Report to:** D:\Skills\UnityAgree\.superpowers\sdd\claude-permission-manager\task-2-report.md

