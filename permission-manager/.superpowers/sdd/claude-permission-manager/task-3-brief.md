# Task 3: Webview UI Development

**Context:** Task 1 (scaffold) & Task 2 (PermissionCollector) completed. Now you are building the UI layer—an interactive Webview panel where users see pending permissions and approve them in bulk. This task produces the HTML/CSS/JS frontend and the TypeScript `WebviewProvider` class that manages the panel lifecycle and message flow.

**Depends on:** Task 1 (extension.ts hooks), Task 2 (PermissionCollector event stream)

**Files to create/modify:**
- Create: `webview/index.html` — UI markup
- Create: `webview/style.css` — Dark theme styles
- Create: `webview/script.js` — Webview client logic
- Replace: `src/WebviewProvider.ts` — Full implementation (currently a stub)

---

## 1. webview/index.html — Exact markup

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Permission Manager</title>
  <link rel="stylesheet" href="./style.css">
</head>
<body>
  <div class="container">
    <header>
      <h1>🔐 Permission Manager</h1>
      <p>Approve permissions from all VSCode extensions in one place</p>
    </header>

    <div id="permissionsList" class="permissions-list">
      <!-- Dynamically populated -->
    </div>

    <div class="controls">
      <button id="approveAllBtn" class="btn btn-primary">✓ Approve All</button>
      <button id="denyAllBtn" class="btn btn-danger">✗ Deny All</button>
      <button id="applyBtn" class="btn btn-success" disabled>Apply Selected</button>
    </div>

    <div id="status" class="status"></div>
  </div>

  <script src="./script.js"></script>
</body>
</html>
```

---

## 2. webview/style.css — Exact styles (VSCode dark theme)

```css
:root {
  --bg: #1e1e1e;
  --text: #e0e0e0;
  --border: #3e3e42;
  --primary: #007acc;
  --success: #4ec9b0;
  --danger: #f48771;
  --hover: #2d2d30;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  background-color: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
}

.container {
  max-width: 700px;
  margin: 20px auto;
  padding: 0 20px;
}

header {
  margin-bottom: 20px;
}

header h1 {
  font-size: 20px;
  margin-bottom: 8px;
}

header p {
  color: #888;
  font-size: 13px;
}

.permissions-list {
  border: 1px solid var(--border);
  border-radius: 6px;
  margin-bottom: 20px;
  max-height: 450px;
  overflow-y: auto;
}

.permission-item {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  transition: background-color 0.15s;
}

.permission-item:hover {
  background-color: var(--hover);
}

.permission-item:last-child {
  border-bottom: none;
}

.permission-checkbox {
  width: 18px;
  height: 18px;
  margin-right: 12px;
  cursor: pointer;
  accent-color: var(--primary);
}

.permission-info {
  flex: 1;
}

.permission-name {
  font-weight: 600;
  margin-bottom: 4px;
}

.permission-badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 3px;
  background-color: #3e3e42;
  color: #999;
  margin-left: 8px;
}

.permission-desc {
  color: #888;
  font-size: 12px;
}

.controls {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.btn {
  flex: 1;
  padding: 10px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background-color 0.15s;
}

.btn-primary {
  background-color: var(--primary);
  color: white;
}

.btn-primary:hover {
  background-color: #1084d7;
}

.btn-danger {
  background-color: var(--danger);
  color: white;
}

.btn-danger:hover {
  background-color: #f59281;
}

.btn-success {
  background-color: var(--success);
  color: #1e1e1e;
}

.btn-success:hover:not(:disabled) {
  background-color: #5dd9c1;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.status {
  padding: 12px;
  border-radius: 4px;
  min-height: 20px;
  display: none;
  border-left: 3px solid;
}

.status.visible {
  display: block;
}

.status.success {
  background-color: #1e3a1f;
  color: #4ec9b0;
  border-left-color: #4ec9b0;
}

.status.error {
  background-color: #3a1e1e;
  color: #f48771;
  border-left-color: #f48771;
}
```

---

## 3. webview/script.js — Webview client logic

```javascript
const vscode = acquireVsCodeApi();

let allPermissions = [];
let selectedPermissions = new Set();

// Event listeners
document.getElementById('approveAllBtn').addEventListener('click', selectAll);
document.getElementById('denyAllBtn').addEventListener('click', deselectAll);
document.getElementById('applyBtn').addEventListener('click', applySelected);

// Listen for messages from extension
window.addEventListener('message', (event) => {
  const { type, data } = event.data;

  if (type === 'updatePermissions') {
    allPermissions = data.permissions || [];
    renderPermissions();
  } else if (type === 'statusUpdate') {
    showStatus(data.message, data.level);
  }
});

function renderPermissions() {
  const list = document.getElementById('permissionsList');
  list.innerHTML = '';

  if (allPermissions.length === 0) {
    list.innerHTML = '<div style="padding: 30px; text-align: center; color: #888;">No pending permissions</div>';
    updateApplyButton();
    return;
  }

  allPermissions.forEach(perm => {
    const div = document.createElement('div');
    div.className = 'permission-item';

    div.innerHTML = `
      <input type="checkbox" class="permission-checkbox" data-perm-id="${perm.id}">
      <div class="permission-info">
        <div class="permission-name">
          ${perm.name}
          <span class="permission-badge">${perm.extensionName}</span>
        </div>
        <div class="permission-desc">${perm.description}</div>
      </div>
    `;

    list.appendChild(div);

    const checkbox = div.querySelector('.permission-checkbox');
    checkbox.addEventListener('change', (e) => {
      if (e.target.checked) {
        selectedPermissions.add(perm.id);
      } else {
        selectedPermissions.delete(perm.id);
      }
      updateApplyButton();
    });
  });
}

function selectAll() {
  document.querySelectorAll('.permission-checkbox').forEach(box => {
    box.checked = true;
    selectedPermissions.add(box.dataset.permId);
  });
  updateApplyButton();
}

function deselectAll() {
  document.querySelectorAll('.permission-checkbox').forEach(box => {
    box.checked = false;
  });
  selectedPermissions.clear();
  updateApplyButton();
}

function applySelected() {
  if (selectedPermissions.size === 0) return;

  vscode.postMessage({
    type: 'approvePermissions',
    data: { permissions: Array.from(selectedPermissions) }
  });

  showStatus('Applying permissions...', 'info');
}

function updateApplyButton() {
  const btn = document.getElementById('applyBtn');
  btn.disabled = selectedPermissions.size === 0;
}

function showStatus(message, level) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = `status visible ${level}`;

  if (level === 'success') {
    setTimeout(() => status.classList.remove('visible'), 3000);
  }
}

// Request initial permissions on load
vscode.postMessage({ type: 'getPermissions' });
```

---

## 4. src/WebviewProvider.ts — Replace stub with full implementation

```typescript
import * as vscode from 'vscode';
import { PermissionCollector } from './PermissionCollector';
import { PermissionApplier } from './PermissionApplier';
import * as path from 'path';

export class WebviewProvider {
  private panel?: vscode.WebviewPanel;
  private permissionCollector: PermissionCollector;
  private permissionApplier: PermissionApplier;
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext, collector: PermissionCollector) {
    this.context = context;
    this.permissionCollector = collector;
    this.permissionApplier = new PermissionApplier();
  }

  public show() {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'permissionManager',
      'Permission Manager',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    this.setWebviewContent();
    this.setupMessageListeners();

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    // Forward permission changes to webview
    this.permissionCollector.onPermissionsChanged((perms) => {
      if (this.panel) {
        this.panel.webview.postMessage({
          type: 'updatePermissions',
          data: { permissions: perms }
        });
      }
    });
  }

  private setWebviewContent() {
    if (!this.panel) return;

    const scriptUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'script.js')
    );
    const styleUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'style.css')
    );

    this.panel.webview.html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Permission Manager</title>
        <link rel="stylesheet" href="${styleUri}">
      </head>
      <body>
        <div class="container">
          <header>
            <h1>🔐 Permission Manager</h1>
            <p>Approve permissions from all VSCode extensions in one place</p>
          </header>
          <div id="permissionsList" class="permissions-list"></div>
          <div class="controls">
            <button id="approveAllBtn" class="btn btn-primary">✓ Approve All</button>
            <button id="denyAllBtn" class="btn btn-danger">✗ Deny All</button>
            <button id="applyBtn" class="btn btn-success" disabled>Apply Selected</button>
          </div>
          <div id="status" class="status"></div>
        </div>
        <script src="${scriptUri}"><\/script>
      </body>
      </html>
    `;
  }

  private setupMessageListeners() {
    if (!this.panel) return;

    this.panel.webview.onDidReceiveMessage(async (message) => {
      if (message.type === 'getPermissions') {
        const perms = await this.permissionCollector.getPermissions();
        this.panel?.webview.postMessage({
          type: 'updatePermissions',
          data: { permissions: perms }
        });
      } else if (message.type === 'approvePermissions') {
        try {
          await this.permissionApplier.approvePermissions(message.data.permissions);
          this.panel?.webview.postMessage({
            type: 'statusUpdate',
            data: { message: `✓ Approved ${message.data.permissions.length} permission(s)`, level: 'success' }
          });
        } catch (error) {
          this.panel?.webview.postMessage({
            type: 'statusUpdate',
            data: { message: `✗ Error: ${error}`, level: 'error' }
          });
        }
      }
    });
  }
}
```

---

## Global Constraints (binding)

- VSCode 1.85+
- TypeScript 5.0+
- Webview must use asset URIs (asWebviewUri) for security
- All messages go through vscode.postMessage/onDidReceiveMessage
- Dark theme styling required

## Deliverables

1. `webview/index.html` — Exact markup from section 1
2. `webview/style.css` — Exact styles from section 2  
3. `webview/script.js` — Exact client logic from section 3
4. `src/WebviewProvider.ts` — Replace stub with full class from section 4
5. `npm run compile` succeeds without errors
6. One commit: "feat: implement Webview UI and permission management panel"

## Test command

```bash
npm run compile
# Verify no TypeScript errors
```

**Report to:** D:\Skills\UnityAgree\.superpowers\sdd\claude-permission-manager\task-3-report.md

