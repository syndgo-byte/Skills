# Task 4: PermissionApplier Implementation

**Context:** Tasks 1–3 complete. Now implementing the permission approval logic—the component that takes user-selected permission IDs from the Webview and applies them to extension settings.

**Depends on:** Task 1 (types.ts), Task 3 (calls from WebviewProvider)

**Files to create:**
- Create: `src/PermissionApplier.ts` — Main applier class
- Create: `test/PermissionApplier.test.ts` — Unit tests

---

## 1. src/PermissionApplier.ts

```typescript
import * as vscode from 'vscode';

export class PermissionApplier {
  async approvePermissions(permissionIds: string[]): Promise<void> {
    for (const id of permissionIds) {
      await this.approveSingle(id);
    }
  }

  private async approveSingle(id: string): Promise<void> {
    const [extensionId, permName] = id.split(':');

    if (extensionId === 'claude') {
      await this.approveClaudePermission(permName);
    }
  }

  private async approveClaudePermission(permName: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('claude');
    const permissions = config.get('permissions', {}) as any;
    const allowed = permissions.allowed || {};

    if (!allowed[permName]) {
      allowed[permName] = true;
    }

    const updated = { ...permissions, allowed };

    try {
      await config.update('permissions', updated, vscode.ConfigurationTarget.Workspace);
    } catch (error) {
      throw new Error(`Failed to approve Claude permission "${permName}": ${error}`);
    }
  }
}
```

---

## 2. test/PermissionApplier.test.ts

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';
import { PermissionApplier } from '../src/PermissionApplier';

suite('PermissionApplier', () => {
  let applier: PermissionApplier;

  setup(() => {
    applier = new PermissionApplier();
  });

  test('should approve single Claude permission', async () => {
    await assert.doesNotReject(
      () => applier.approvePermissions(['claude:Read'])
    );
  });

  test('should approve multiple permissions idempotently', async () => {
    await applier.approvePermissions(['claude:Read']);
    await applier.approvePermissions(['claude:Read']);
  });

  test('should approve multiple permissions in one call', async () => {
    await assert.doesNotReject(
      () => applier.approvePermissions(['claude:Read', 'claude:Bash'])
    );
  });
});
```

---

## Key Requirements

**Idempotency:** Use `if (!allowed[permName])` to prevent duplicate writes.

**Error Handling:** Include permission name in error message.

**Workspace-Only:** Use `vscode.ConfigurationTarget.Workspace` (never User).

**Namespace:** Permission ID format is `"extensionId:permissionName"` (split on `:`).

---

## Deliverables

1. `src/PermissionApplier.ts` — Full implementation with idempotency
2. `test/PermissionApplier.test.ts` — 3+ test cases
3. `npm run compile` succeeds
4. Commit: "feat: implement PermissionApplier for settings updates"

**Report to:** D:\Skills\UnityAgree\.superpowers\sdd\claude-permission-manager\task-4-report.md

