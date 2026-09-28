# Task 5: Integration & Final Testing

**Context:** Tasks 1–4 complete. All components built separately. This task is assembly: ensure everything integrates, wires together correctly, compiles, and runs as a cohesive extension.

**Files to modify:**
- Verify: `src/extension.ts` — already has PermissionCollector, WebviewProvider wiring
- Verify: All imports and dependencies are satisfied

**What you will do:**

1. **Verify build succeeds:**
   ```bash
   npm run compile
   ```
   Should produce `dist/extension.js` with no errors.

2. **Verify git history is clean:**
   ```bash
   git log --oneline
   ```
   Should show 5 commits:
   - Task 1: scaffold
   - Task 2: PermissionCollector
   - Task 3: Webview UI
   - Task 4: PermissionApplier
   - Task 5: integration commit

3. **Final integration checks:**
   - [ ] `src/extension.ts` imports PermissionCollector, WebviewProvider correctly
   - [ ] `src/extension.ts` activate() instantiates both classes
   - [ ] `src/extension.ts` deactivate() cleans up collector
   - [ ] `src/PermissionCollector.ts` imports Permission, ExtensionConfig from types.ts
   - [ ] `src/PermissionApplier.ts` is fully implemented (not a stub)
   - [ ] `src/WebviewProvider.ts` is fully implemented (not a stub)
   - [ ] `webview/script.js` sends/receives messages correctly
   - [ ] All TypeScript interfaces are used consistently
   - [ ] No orphaned stub files remain
   - [ ] `dist/extension.js` is built and present (>2KB)

4. **Commit:**
   ```bash
   git add -A
   git commit -m "feat: complete permission manager extension integration"
   ```

5. **Write report:**
   D:\Skills\UnityAgree\.superpowers\sdd\claude-permission-manager\task-5-report.md

**Report contract:**
- Status: DONE
- Build results: show full `npm run compile` output
- Full git log for all 5 commits
- Verification checklist results
- Any issues or concerns

**Do not:**
- Modify or rewrite existing Task 1–4 code
- Spawn subagents
- Create new features beyond the brief

**Model:** Haiku for verification task.

