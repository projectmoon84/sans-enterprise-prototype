# Bulk actions: implementation plan

**Project:** SANS Enterprise Portal prototype
**Written:** 16 October 2026
**Builds on:** `docs/csv-review-and-bulk-actions-plan.md` (the design and the decisions), `docs/profile-and-activity-plan.md` (store and event log), `AGENTS.md` (rules for agents)

This is the build plan for bulk actions on the **CSV review**, **Students** and **Portal users** tables. It starts from the code as it stands after the database v3, activity log, profile, training and alerts work. Hand it to Claude Code or Codex one phase at a time.

---

## Where the code is today

What already exists and can be reused:

| Piece | Where | Notes |
|---|---|---|
| Row selection | `state.selected` in `fidelity.js`; header "select all" | Holds **role-row ids** from `store.view()` (one row per person per role), not person ids |
| Actions menu | `actionsMenu()` in `fidelity.js` | Lists: Export CSV, Activate / Suspend selected, Resend invitations, Delete selected. CSV review: Assign voucher / admin group / team, Remove rows |
| Bulk store commands | `store.js` | `bulkStatus`, `bulkResend`, `archivePeople` and `commitCsvImport` already write one event per person with a shared `batchId` |
| Assignment picker | `openPicker()` / `savePicker()` in `fidelity.js`; `pickerGroups()` in `people.js` | A full-screen modal; voucher-aware admin groups already work for bulk |
| Permissions | `personPermissions(person, actor)` in `alerts.js` | Used by the profile, **not** by bulk actions yet |
| Batch display | `groupBatches()` and `batchHeadline()` in `activity.js` | The Activity page already groups a batch into one entry |

## Problems to fix first

1. **"Delete selected" removes the whole person.** `archivePeople()` archives the person, so deleting a student who is also an admin removes their portal access too. Bulk remove must remove **only the role of the table you're on**, using `removeStudent` or `removePortalAccess` per row. Archiving the whole person should only happen from the profile.
2. **No permission checks.** Any signed-in role can bulk-suspend, resend or delete anyone. Bulk actions must check `personPermissions()` per row, skip rows the actor can't change, and hide actions the actor can never take.
3. **All-or-nothing failures.** Store commands throw on the first problem, and `dispatch()` rethrows, so one bad row stops the whole batch with an error. Bulk commands should **apply what they can and report what they skipped, and why**.
4. **Hidden selections.** Rows selected and then hidden by a filter or search are still acted on, with no indication.
5. **Not built yet:** no *Needs voucher* status (the CSV review blocks rows without a voucher), no saved import drafts, no undo, no preview of side effects, and actions are tucked into a menu rather than a bar.

---

## Architecture

### 1. One shape for every bulk result

Every bulk command, and its preview, returns:

```js
{
  batchId,                       // shared by every event the command writes
  changed:   [{ id, name }],     // rows that changed
  unchanged: [{ id, name }],     // already in the requested state (e.g. already on that voucher)
  skipped:   [{ id, name, reason }],   // not allowed or not valid, with a plain-English reason
  effects:   [{ id, name, message }],  // side effects, e.g. "Admin group EMEA Operations cleared"
  undoable:  true | false
}
```

Skip reasons are fixed strings so they can be counted and grouped, for example:

- "You don't manage this student's voucher"
- "Limited Admins can only have one voucher"
- "Needs a voucher before an admin group can be assigned"
- "Invitation already accepted"
- "Admin group isn't covered by this voucher"

### 2. Preview by "dry run"

Add `store.preview(commandName, ...args)`. It runs the same command against a copy of the data and doesn't save, returning the bulk result above.

The UI calls `preview` first:

- **If the preview has `effects` or `skipped`**, show the preview dialog.
- **Otherwise**, apply immediately and show the result toast.

Because the preview runs the real command, it can never disagree with what actually happens.

### 3. Undo by batch

Add `store.undoBatch(batchId)`. It reads that batch's events and reverses each change using its `changes` (before and after values). It writes new events with `action: 'bulk.undone'` and a new `batchId`. Nothing in the log is deleted or edited.

- **Undoable:** assign or clear voucher, admin group or team; status changes; portal access add / remove / replace; role change; remove role.
- **Not undoable:** sending or resending invitations (the email has gone). The toast says "Invitations sent" with no Undo.
- Undo is offered while the toast is visible, about 10 seconds, and on the Activity page entry for the batch (Admins only).

### 4. New shared UI module: `src/bulk.js`

Loaded after `tables.js`, so it can use the sticky header and frozen columns. Contains:

| Component | Behaviour |
|---|---|
| **Selection model** | `selection.for(view)` keeps selected ids per table. "Select all" selects every row matching the current filters. After that, a link offers "Select all 312 students" across filters. Shows "8 selected · 2 hidden by filters" whenever selected rows aren't visible. Cleared on leaving the table. |
| **Bulk bar** | Replaces the toolbar while anything is selected. Shows the selection count, the main actions as buttons, a "More" menu for the rest, and "Clear". The actions are set per table (see the action matrix). Actions the actor can never take are hidden; actions that would skip every selected row are disabled, with a tooltip saying why. |
| **Quick filter chips** | Row of chips with live counts above the table, for example "Errors 2 · Needs voucher 6 · No admin group 14 · No team 21 · Ready 42". Per table: CSV review uses row status; Students uses Needs voucher, Pending invite, Suspended, No team; Portal users uses Pending invite, Suspended, by role. |
| **Cell pop-over picker** | Anchored to a table cell or bulk bar button: a search box, a list of options, keyboard support (arrows, Enter, Esc) and focus that returns to the trigger. Replaces the full-screen picker modal for vouchers, admin groups, teams and work roles. |
| **Preview dialog** | Lists changed, unchanged and skipped counts (expandable to names and reasons) and any side effects, with Cancel and Confirm. |
| **Result toast** | "Assigned 5 students to Cyber Defense FY26 · 2 skipped" with **View** (expands skipped and effects) and **Undo**. Stays visible while hovered or focused. |

---

## Action matrix

**Permissions key:** **A** = Admin or SSO Admin; **L** = Limited Admin, only on students in their voucher and admin groups; **V** = Viewer, who gets no bulk actions apart from Export.

### CSV review (rows not yet saved; changes are to the draft only, so no events until Done)

| Action | Who | Preview when | Notes |
|---|---|---|---|
| Assign voucher | A, L (own voucher only) | It would clear admin groups | |
| Assign admin group | A, L | Some rows have no voucher (skipped) | Only groups covered by **every** selected row's voucher |
| Add to team / Clear team | A, L | Rows already have a different team (it gets replaced) | |
| Set work role | A, L | Never | Free text with suggestions |
| Remove from import | A, L | Never | Undo in the toast (local) |
| Export selected | everyone | Never | |

### Students

| Action | Store command (new or changed) | Who | Preview when | Events |
|---|---|---|---|---|
| Assign voucher | `bulkAssignStudentVoucher(ids, voucherId)` | A, L (own voucher) | Clears admin groups; **releases held invitations** for Needs voucher rows | `student.voucher_changed` (+ `student.invite_released`) |
| Assign admin group | `bulkAssignStudentAdminGroup(ids, groupId \| null)` | A, L | Some skipped | `student.admin_group_changed` |
| Add to team / Remove from team | `bulkAssignStudentTeam(ids, teamId \| null)` | A, L | Replaces existing team | `student.team_added` / `_removed` / `_changed` |
| Resend invitation | `bulkResend` (fix: permissions, results) | A, L | Some skipped (already active) | `student.invite_resent` |
| Suspend / Reactivate | `bulkStatus` (fix: permissions, results, role-scoped) | A, L | Always (confirm) | `student.suspended` / `reactivated` |
| Remove as student | `bulkRemoveRole(ids, 'student')`, **replacing** `archivePeople` here | A, L | Always (confirm; notes people who keep portal access) | `student.removed` |
| Export selected | n/a | everyone | Never | (optional: `export.created`) |

### Portal users

Portal access holds several values, so each access action asks **Add**, **Remove** or **Replace with** in its pop-over.

| Action | Store command | Who | Preview when | Events |
|---|---|---|---|---|
| Voucher access | `bulkPortalAccess(ids, { field: 'vouchers', mode, values })` | A | Limited Admins skipped (one voucher only); removing a voucher also clears admin groups it alone covered | `portal.voucher_added` / `_removed` |
| Admin group access | same, `field: 'adminGroups'` | A | Groups not covered by a person's vouchers (skipped for that person) | `portal.admin_group_added` / `_removed` |
| Team access | same, `field: 'teams'` | A | Never (unless skipped) | `portal.team_access_added` / `_removed` |
| Change role | `bulkChangeRole(ids, role)` | A | Becoming Limited Admin with more than one voucher (skipped, with reason); can't change your own role | `portal.role_changed` |
| Resend invitation, Suspend / Reactivate | as for students | A | as for students | `portal.*` |
| Remove portal access | `bulkRemoveRole(ids, 'portal')` | A | Always; can't remove yourself or the last Admin | `portal.revoked` |

**Safety rules (all tables):**

- You can't suspend, demote or remove yourself in a bulk action. You're skipped, with a reason.
- The organisation must always keep at least one active Admin.

---

## Needs voucher status (for the CSV flow)

- Add `'Needs voucher'` to student statuses in `store.js`.
  - `student.voucherId` may be empty **only** when status is Needs voucher.
  - `validateStoreDatabase` enforces this both ways.
- `commitCsvImport` accepts rows without a voucher and saves them as Needs voucher.
  - These rows write `student.added_needs_voucher` instead of `student.invited`.
  - `import.completed` records the file name and counts: invited, needs voucher, excluded.
- Assigning a voucher to a Needs voucher student, singly or in bulk, sets the status to **Pending invite** and writes `student.voucher_changed` and `student.invite_released`.
- **Students list:**
  - the voucher cell shows an amber "⚠ Assign voucher" button that opens the cell pop-over
  - the status shows "Needs voucher"
  - a "Needs voucher" chip, and a banner while any exist
- **Alerts:** a new `alertsFor()` rule: "No voucher: invitation on hold" (severity: action needed), with an Assign voucher action.
- **Profile:** the Student details card shows "Invitation on hold until a voucher is assigned".
- Update `AGENTS.md`'s people-model rule: *A student needs exactly one voucher before they're invited. Until then, they're held in the Needs voucher state.*

---

## Phases

### Phase B1: Fix the foundations (half a day to a day)

**Scope:**
- Add the bulk result shape. Make `bulkStatus`, `bulkResend` and a new `bulkRemoveRole` return it, applying what they can and skipping the rest with reasons. They must never throw for a single bad row.
- Add permission checks using `personPermissions()` and the actor from `db.session`, plus the self-protection and last-Admin rules.
- Replace "Delete selected" on Students and Portal users with role-scoped **Remove as student** and **Remove portal access**, using `bulkRemoveRole`. Keep "archive person" on the profile only.
- Add `store.preview()` (dry run).
- Show "N selected · M hidden by filters".
- **Tests:**
  - removing the student role keeps portal access
  - a Limited Admin's bulk suspend skips out-of-scope students
  - you can't remove yourself or the last Admin
  - a preview returns the same result as the real command but changes nothing
  - one event per changed person, all with the same `batchId`

**Done when:** signing in as a Limited Admin and bulk-suspending a mix of students suspends only the ones they manage, and the toast reports the rest as skipped. Removing Ada Whitfield as a student leaves her an Admin.

<details><summary>Prompt</summary>

```
Read AGENTS.md, docs/bulk-actions-implementation-plan.md ("Problems to fix first", "Architecture" 1–2, "Safety rules") and implement Phase B1 only.
- Define the bulk result shape and make bulkStatus, bulkResend and a new bulkRemoveRole(ids, role) return it: apply what is allowed/valid, skip the rest with fixed plain-English reasons, never throw for a single row.
- Enforce permissions per row with personPermissions() and the session actor; enforce "not yourself" and "at least one active Admin".
- Replace "Delete selected" on Students/Portal users with role-scoped "Remove as student" / "Remove portal access" (confirmation dialog). archivePeople stays available only where a whole person is archived from the profile.
- Add store.preview(name, ...args): runs the command on a clone and returns its result without saving or logging.
- Show "N selected · M hidden by filters" in the toolbar when relevant.
- Update dispatch() handling so bulk results produce a toast like "Suspended 4 students · 2 skipped" with a View link that lists skipped names and reasons.
Add the listed tests. Run check, test, build; verify in the browser signed in as Ada (Admin) and as a Limited Admin. Summarise.
```
</details>

---

### Phase B2: Shared bulk UI (1 day)

**Scope:**
- Create `src/bulk.js` (add it to `build.mjs` after `tables.js`, and to the load order in `AGENTS.md`), containing:
  - the selection model
  - the **bulk bar** replacing the toolbar while rows are selected
  - **quick filter chips** with live counts
  - the **cell pop-over picker**
  - the **preview dialog**
  - the **result toast** with View (and an Undo placeholder)
- Wire the bulk bar and chips into Students and Portal users using the existing actions (status, resend, remove, export).
- Retire the old Actions dropdown on these tables.
- Accessibility:
  - the bulk bar is announced when it appears ("5 selected")
  - the pop-over is a proper listbox with keyboard support
  - focus returns to the trigger
- Phone width: the bulk bar sits at the bottom of the screen.

**Done when:** selecting rows swaps the toolbar for the bulk bar, chips filter with correct counts, and all existing bulk actions work from the bar with result toasts.

<details><summary>Prompt</summary>

```
Read docs/bulk-actions-implementation-plan.md ("Architecture" 4) and docs/csv-review-and-bulk-actions-plan.md (decisions 3–6). Implement Phase B2 only.
Create src/bulk.js with: per-table selection model (select all = all rows matching filters, plus "Select all N" across filters), a bulk bar that replaces the toolbar while rows are selected (count, primary action buttons, More menu, Clear), quick-filter chips with live counts, a cell-anchored pop-over picker (search, keyboard: arrows/Enter/Esc, focus return), a preview dialog (changed/unchanged/skipped/effects, expandable), and a result toast (View + Undo slot; stays while hovered/focused).
Wire it into Students and Portal users with the existing actions; remove the old Actions dropdown there. Hide actions the actor can never take; disable ones that would skip every selected row, with a tooltip. Bottom-docked bar under 760px. Match fidelity.css styling and Material Symbols via icon(). UK English, sentence case. Run check/test/build; verify at 1440px and 390px. Summarise.
```
</details>

---

### Phase B3: Assignment actions on Students and Portal users (1 day)

**Scope:**
- **Student commands:**
  - `bulkAssignStudentVoucher`, which clears admin groups the new voucher doesn't cover, as a side effect
  - `bulkAssignStudentAdminGroup`, which only offers groups shared by the selected vouchers and skips rows without one
  - `bulkAssignStudentTeam`, which handles add, replace and remove
- **Portal commands:**
  - `bulkPortalAccess(ids, { field, mode, values })`, with add / remove / replace for vouchers, admin groups and teams
  - `bulkChangeRole`
  - Limited Admin and coverage rules enforced per person
- Bulk bar buttons open the pop-over. For portal fields, the pop-over starts with an Add / Remove / Replace choice.
- Preview dialog whenever there are effects or skips.
- Events as in the action matrix, all with a shared `batchId` and `via: 'bulk'`.
- **Tests:**
  - a voucher change clears uncovered admin groups
  - a mixed-voucher selection offers only shared groups
  - Limited Admins are skipped on a second voucher
  - replace versus add versus remove
  - role change rules
  - every changed person gets exactly the right events

**Done when:** you can select five students and put them on a voucher in two clicks, with a correct preview when admin groups would be cleared. Portal users can have team access added in bulk.

<details><summary>Prompt</summary>

```
Implement Phase B3 of docs/bulk-actions-implementation-plan.md: the student and portal assignment commands in store.js (returning the bulk result shape, permission-checked, never throwing per row), their bulk-bar buttons using the cell pop-over, add/remove/replace for portal multi-value fields, and preview whenever there are effects or skips. Use the event keys in the action matrix with a shared batchId and via: 'bulk'. Respect the people-model rules in AGENTS.md (vouchers first, Limited Admin one voucher, admin groups covered by voucher). Add the listed tests. Run check/test/build, verify in the browser, summarise.
```
</details>

---

### Phase B4: Undo (half a day)

**Scope:**
- `store.undoBatch(batchId)`, which reverses a batch from its events' `changes` and writes `bulk.undone` events with a new `batchId`.
  - If something changed since the batch, those rows are skipped. For example, if the student's voucher was edited again afterwards, that row isn't reverted, with the reason "Changed since".
- Undo button in the result toast for undoable batches.
- Undo on Activity page batch entries, for Admins only.
- `describeEvent` wording for `bulk.undone`.
- **Tests:**
  - undoing restores the exact before-state
  - undo skips rows changed since
  - undo writes events and deletes none
  - invitation batches aren't undoable

**Done when:** you can assign five students to the wrong voucher, press Undo, and see them back on their old vouchers, with both actions in the Activity log.

<details><summary>Prompt</summary>

```
Implement Phase B4 of docs/bulk-actions-implementation-plan.md ("Architecture" 3). Add store.undoBatch(batchId) that reverses a batch from its events' changes, skips rows changed since the batch, and logs bulk.undone events with a new batchId (never edits or deletes events). Wire Undo into the result toast for undoable batches and into Activity page batch entries for Admins. Add describeEvent wording and the listed tests. Run check/test/build, verify, summarise.
```
</details>

---

### Phase B5: CSV review rebuild and Needs voucher (1–2 days)

**Scope:**
- **Needs voucher status:** everything in the "Needs voucher status" section above, including the alert rule and the AGENTS.md rule update.
- **One shared row-check function:** `checkStudentRow(row, db)` returns problems with levels `error`, `needsVoucher` and `info`. Used by:
  - the CSV review
  - the add-student form
  - the student edit dialogs
- **CSV review screen:**
  - three-level status column (✓ Ready / ⚠ Needs voucher / ✕ Error) with explanations
  - cells edited with the pop-over
  - quick chips: Errors, Needs voucher, No admin group, No team, Ready
  - the bulk bar with the CSV review actions
  - row ⋮ and right-click menu
- **Done dialogs** as in the design doc, decision 8, including "Download errors CSV".
- **Saved drafts:** the import is stored in `db.importDrafts` (not logged) and survives reload. Students shows "Resume import / Discard". One draft per actor.
- **After Done:**
  - go to Students with the new rows highlighted
  - toast: "50 students added. 44 invited. 6 need a voucher before they can be invited. [Show them]"
  - [Show them] applies the Needs voucher chip
- `import.completed` records file name and counts.
- **Tests:**
  - row-check levels
  - Needs voucher rows commit without invitations
  - assigning a voucher releases the invitation
  - drafts survive reload
  - excluded error rows are reported in the summary event

**Done when:** you can upload the sample CSV, fix some rows singly and some in bulk, press Done with two rows still missing a voucher, choose "Add anyway", land on Students with the toast, then assign those two a voucher and see their status change to Pending invite.

<details><summary>Prompt</summary>

```
Implement Phase B5 of docs/bulk-actions-implementation-plan.md together with decisions 1–2 and 8–10 of docs/csv-review-and-bulk-actions-plan.md.
- Add the 'Needs voucher' student status end to end (store validation both ways, commitCsvImport, held/released invitations with student.added_needs_voucher and student.invite_released events, Students list flag/chip/banner, alert rule, profile note, AGENTS.md rule update).
- Add checkStudentRow(row, db) (levels: error / needsVoucher / info) and use it in CSV review, the add-student form and student edit dialogs.
- Rebuild the CSV review with the three-level status column, cell pop-overs, quick chips, the bulk bar (CSV review actions), row menu, the Done dialogs (incl. "Download errors CSV"), saved drafts with Resume/Discard on Students, and the post-import toast with [Show them].
Add the listed tests. Run check/test/build; walk through the "Done when" scenario in the browser at 1440px and 390px; summarise.
```
</details>

---

### Phase B6: Polish (half a day)

- Keyboard shortcuts on tables: **Shift-click** selects a range; **Ctrl/Cmd-A** inside a table selects all visible rows; **Esc** clears the selection.
- Highlight changed rows briefly after a bulk action.
- Very large selections (more than 200 rows): show progress in the toast while applying.
- Check the README walkthrough and update its "What works" section.
- Accessibility check of the bulk bar, pop-overs and dialogs with keyboard only.

---

## Effort and order

| Phase | Effort | Depends on |
|---|---|---|
| B1 Foundations | half a day to a day | none |
| B2 Shared bulk UI | 1 day | B1 |
| B3 Assignment actions | 1 day | B2 |
| B4 Undo | half a day | B3 |
| B5 CSV review and Needs voucher | 1–2 days | B2, B3 (B4 optional) |
| B6 Polish | half a day | all |

If the CSV scenario is the priority for a SANS review, do **B1 → B2 → B5** first, then B3 and B4. B5 only needs the student voucher, admin group and team commands, so build those parts of B3 within B5.

---

## Open questions

Carried over from the design doc, plus two new ones:

1. Is it acceptable for SANS that a student exists in the portal before they're invited (Needs voucher)?
2. Should Needs voucher students time out (for example after 30 days)?
3. How long should Undo be available? Default: about 10 seconds in the toast, and indefinitely from the Activity page for Admins.
4. Duplicates in a CSV: always an error (default), or offer to update the existing student's assignments?
5. **New:** may a Limited Admin bulk-assign students to a voucher they don't manage? Default: no. They only see their own vouchers in the picker.
6. **New:** should Viewers be able to export selected rows? Default: yes, since export is read-only, but log the export once the Activity log records exports.
