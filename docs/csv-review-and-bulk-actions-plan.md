# CSV review and bulk actions: plan

> **Status: built** (16 October 2026). See "What was built, and where it differs" at the end.

**Project:** SANS Enterprise Portal prototype
**Written:** 16 October 2026
**Related:** `docs/profile-and-activity-plan.md`

This plan covers reviewing patchy CSV imports inside the portal, editing rows one at a time or in bulk, finishing an import with incomplete data, and reusing the same bulk-action pattern on the Students and Portal users tables.

---

## The scenario

An admin uploads a CSV of new students. Much of it may be missing: no voucher, no admin group, no team. They need to:

1. Review the imported rows in a table inside the portal.
2. Fix individual cells: "Add voucher", "Add admin group", "Add to team".
3. Select several rows and fix them in one go, for example assigning five people to a voucher.
4. Press **Done**. If anyone still has no voucher, they're warned and can choose to continue.
5. Land on the Students table with a toast confirming who was added. Anyone without a voucher is clearly flagged there, with an easy way to fix it.

---

## Key decisions (recommended)

### 1. "No voucher" means "not invited yet", not "can't be added"

Vouchers remain mandatory for **inviting** a student, because the voucher funds their training. A student imported without one is saved with the status **Needs voucher**:

- they appear in the Students table with an amber flag
- **no invitation is sent**, because there's nothing to fund their training yet
- as soon as a voucher is assigned, the invitation goes out automatically and the status becomes **Pending invite**

So student statuses become: `Needs voucher` → `Pending invite` → `Active` (plus `Suspended`).

### 2. Three levels of row problem in the review table

| Level | Examples | Blocks adding? | Look |
|---|---|---|---|
| **Error** | Invalid email, duplicate email, already a student, admin group not covered by the voucher | **Yes.** The row must be fixed or removed | Red badge and red cell outline |
| **Needs voucher** | Voucher missing | No. Can be added as "Needs voucher" | Amber flag on the voucher cell |
| **Ready** | Everything required is present (admin group and team are optional) | No | Green tick |

Missing admin group or team is **not** a problem. Those cells just show quiet "Add admin group" and "Add to team" links.

New SANS account needed (no account found for the email) is shown as an info note, not a problem. It's handled at invite time.

### 3. Edit inside the table with small pop-overs, not full modals

Clicking "Add voucher" in a cell opens a **pop-over anchored to that cell**, with a search box and the list of options. Pick one and it's done. This is faster than the current full-screen picker modal when working through lots of rows. A full modal is still used for editing a whole row (name, email and work role).

### 4. A bulk action bar replaces the toolbar while rows are selected

As soon as one or more rows are ticked, the table's toolbar (filters and search) is replaced by a bar:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ☑ 5 selected   [Assign voucher] [Assign admin group] [Add to team]           │
│                [Set work role] [Remove from import]            [Clear ✕]     │
└──────────────────────────────────────────────────────────────────────────────┘
```

- The bar shows the main actions as buttons rather than hiding them in the Actions menu.
- "Select all" in the header selects every row matching the **current filter**, so "filter to Needs voucher, select all, assign voucher" is three clicks.
- After a filtered select-all, a link offers "Select all 48 rows" across every filter, in case that was what you meant.

### 5. Quick filter chips with counts above the table

```
[All 50]  [Errors 2]  [Needs voucher 6]  [No admin group 14]  [No team 21]  [Ready 42]
```

Clicking a chip filters the table. Counts update live as rows are fixed. This is the fastest way to work through a patchy import.

### 6. Bulk changes show a short preview when there are side effects

Most bulk assignments are applied straight away, with an **Undo** link in the toast. When a change has knock-on effects, a short confirmation shows them first. For example:

> **Assign 5 students to Offensive Ops FY26?**
> 3 will move to this voucher. 2 are already on it.
> ⚠ 2 students' admin groups (EMEA Operations) aren't covered by this voucher and will be cleared.
> [Cancel] [Assign voucher]

### 7. Admin group follows the voucher, in bulk too

- **Assign admin group** only offers groups covered by **every** selected row's voucher. If the selection mixes vouchers, the pop-over says: "Showing admin groups shared by all 3 vouchers in your selection."
- Rows with no voucher yet are skipped, with a note: "2 selected students need a voucher before an admin group can be assigned."
- Changing a voucher clears any admin group it no longer covers (decision 6 warns about this first).

### 8. Done is never a dead end

Pressing **Done** checks the rows and shows the right dialog:

- **All ready:** add everyone and go straight to Students.
- **Some need a voucher:**
  > **6 students don't have a voucher**
  > They'll be added to Students, but won't be invited until a voucher is assigned.
  > [Keep reviewing] [Add students anyway]
- **Some have errors:**
  > **2 rows have errors and can't be added**
  > Fix them, or continue and leave them out. You can download them as a CSV to fix later.
  > [Keep reviewing] [Download errors CSV] [Continue without them]
- **Both:** one dialog with both sections.

### 9. Landing on Students afterwards

- Go to **Students**, with the new students highlighted for a few seconds.
- Toast: **"50 students added. 44 invited. 6 need a voucher before they can be invited."** with a **[Show them]** action, which applies the "Needs voucher" filter.
- On the Students table, the voucher cell for those students shows an amber **"⚠ Assign voucher"** link that opens the same pop-over. The status column shows **Needs voucher**. The same quick-filter chips and bulk bar are available here too.
- Optionally, show a persistent banner while any exist: "6 students need a voucher before they can be invited. [Review]".

### 10. Save the import in progress

At the moment, staged CSV rows are held only in memory and are lost on reload. A big import is real work, so the draft is saved automatically. If the admin leaves, the Students page shows "You have an unfinished import (50 rows) · [Resume] [Discard]".

---

## The review screen

```
← Back to Students

Review import                                                [Done]
students-october.csv · uploaded 14:52 · 50 rows

[All 50] [Errors 2] [Needs voucher 6] [No admin group 14] [No team 21] [Ready 42]

┌─────────────────────────────────────────────────────────────────────────────┐
│ ☐  Name / email          Work role      Voucher           Admin group   Team │
├─────────────────────────────────────────────────────────────────────────────┤
│ ☐  Alex Chen             SOC Analyst I  Cyber Defense…    Federal Div   SecOps ✓ │
│    alex.chen@…                                                                 │
│ ☐  Jamie Lee             SOC Analyst I  ⚠ Add voucher     + Add         + Add  ⚠ │
│    jamie.lee@…                                                                 │
│ ☐  Taylor Morgan         –              Leadership FY26   + Add         + Add  ✕ │
│    taylor.invalid  ← Invalid email                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Frozen columns:** checkbox and name stay put; the status and ⋮ columns stay on the right (already built).
- **Status column:** ✓ Ready, ⚠ Needs voucher, ✕ Error. Hovering or focusing an icon explains the problem.
- **Row ⋮ / right-click menu:** Edit row, Assign voucher, Assign admin group, Add to team, Remove from import.

---

## Bulk actions by table

The same component (selection, bulk bar, quick filters, pop-overs, preview, undo toast) is used on all three tables. Only the actions differ.

### CSV review

| Action | Notes |
|---|---|
| Assign voucher | Preview if it clears admin groups |
| Assign admin group | Only groups shared by the selected vouchers; skips rows without a voucher |
| Add to team / Remove from team | Students have at most one team, so "Add" replaces any existing team (the preview says so) |
| Set work role | Free text with suggestions |
| Remove from import | No confirmation; Undo in the toast |
| Export selected as CSV | |

### Students

| Action | Notes |
|---|---|
| Assign voucher | Also **sends held invitations** for Needs voucher students; the preview says "4 invitations will be sent" |
| Assign admin group / Add to team / Remove from team | As above |
| Resend invitation | Only Pending invite rows; others are skipped, with a count |
| Suspend / Reactivate | Confirmation |
| Remove from organisation | Confirmation (archive, see the profile plan) |
| Export selected | |

### Portal users

Portal access fields hold **several** values, so bulk edits need to say whether they **add**, **remove** or **replace**:

| Action | Choices | Notes |
|---|---|---|
| Voucher access | Add / Remove / Replace with | Limited Admins can only have one voucher. Adding a second is skipped and reported ("2 Limited Admins skipped") |
| Admin group access | Add / Remove / Replace with | Only groups covered by each person's vouchers; others skipped with a reason |
| Team access | Add / Remove / Replace with | |
| Change role | Admin / Limited Admin / Viewer | Preview warns when Limited Admins would lose extra vouchers |
| Resend invitation, Suspend / Reactivate, Remove access | | As for students |

### Results reporting (all tables)

Every bulk action ends with a toast summarising what happened: "Assigned 5 students to Cyber Defense FY26 · 2 skipped · [Undo]". Anything skipped can be expanded to show who and why.

---

## Activity log tie-in

This fits the event log in the profile plan:

- each bulk action writes **one event per affected person**, all sharing a `batchId` with `via: 'bulk'`
- the import writes `student.invited` or `student.added_needs_voucher` per person, plus one `import.completed` summary (file name and counts) with `via: 'csv'`
- assigning a voucher to a Needs voucher student writes `student.voucher_changed` **and** `student.invited`
- Undo writes its own events ("Priya Raman undid assigning 5 students to Cyber Defense FY26"). The log never loses history.

New catalogue entries: `student.added_needs_voucher`, `student.invite_released`, `bulk.undone`.

---

## Data changes

- `StudentEnrolment.status` gains `'Needs voucher'`, and `voucherId` becomes **optional only while status is Needs voucher**. Validation must enforce: voucher present ⇔ status isn't Needs voucher.
- New `importDrafts: { id, fileName, uploadedAt, uploadedBy, rows: StagedRow[] }[]` for saved imports in progress.
- `StagedRow` keeps `{ rowNumber, name, email, workRole, voucherId?, adminGroupId?, teamId?, problems: Problem[] }`, where `Problem = { level: 'error' | 'needsVoucher' | 'info', code, message, field }`.
- One shared validation function, `checkStudentRow(row, db)`, used by the CSV review, the single-student form and the edit dialogs, so the rules can't drift apart.

---

## Where this fits in the build order

You can build this in either of two ways:

- **Option A, recommended:** do it **after Phase 2** of the profile plan (database v3 and event log). Bulk actions then go through the store and are logged properly from day one. Treat it as **Phase 2.5**.
- **Option B:** do it **now**, on the current code. Much of the review screen already exists, including inline "Add" links, the picker, bulk assign in the Actions menu and a Done dialog. It would mean less to show for the event log, and some rework after Phase 1.

### Steps (Option A)

1. **Shared building blocks:** selection model, bulk action bar, quick filter chips with counts, cell pop-over picker, preview dialog, toast with Undo.
2. **CSV review:**
   - the three-level row status
   - pop-over editing
   - bulk actions
   - voucher-aware admin group rules
   - the Done dialogs
   - saved drafts and Resume
3. **Needs voucher status:**
   - the data change
   - validation
   - held invitations released on voucher assignment
   - Students table flags, chip and banner
   - the post-import toast with [Show them]
4. **Students table bulk actions** using the shared components.
5. **Portal users bulk actions** with add / remove / replace and Limited Admin skipping.
6. **Tests:**
   - row-status rules
   - bulk voucher → admin group clearing
   - Limited Admin skip rules
   - invitations released when a voucher is assigned
   - one event per person per bulk action with a shared batchId
   - Undo

### Prompt for the agent (step 1–3)

```
Read AGENTS.md, docs/profile-and-activity-plan.md (for the store and event log) and docs/csv-review-and-bulk-actions-plan.md. Implement steps 1–3 of "Steps (Option A)" only.
- Build reusable table pieces: selection model, bulk action bar that replaces the toolbar when rows are selected, quick-filter chips with live counts, a cell-anchored pop-over picker (search + list, keyboard accessible), a bulk preview dialog for side effects, and a toast with Undo.
- Rework the CSV review screen with the three-level row status (Error / Needs voucher / Ready), pop-over editing, bulk actions, voucher-aware admin-group rules and the Done dialogs described in decision 8. Save import drafts so they survive reload, with Resume/Discard on Students.
- Add the 'Needs voucher' student status: no invitation until a voucher is assigned; assigning one releases the invitation. Show the amber "Assign voucher" flag and a Needs voucher chip on Students, and the post-import toast with a [Show them] action.
- All changes go through store.js commands and write events (one per person, shared batchId, via 'bulk' or 'csv').
- One shared checkStudentRow() for CSV review, the add-student form and edit dialogs.
UK English, sentence case. Add tests listed in step 6 that apply to steps 1–3. Run check/test/build and verify in the browser at 1440px and 390px. Summarise.
```

---

## Open questions

1. **Held invitations:** is it acceptable for SANS that a student exists in the portal before they've been invited? (It's needed for this flow.)
2. **Who funds a Needs voucher student's requests?** Presumably nobody. Confirm they can't request training until they have a voucher.
3. **Timeout:** should Needs voucher students be cleared out after a while (for example 30 days), or stay indefinitely with an alert?
4. **Undo window:** how long should Undo be available? Default: until the toast closes, about 10 seconds.
5. **Duplicate students in a CSV** (already exist in the portal): treat as an error (default), or offer "Update their assignments instead"?
6. **Import size:** the prototype supports 500 rows. What's the realistic largest import SANS customers do?


---

## What was built, and where it differs

Everything in "Steps (Option A)" is built: the shared pieces (`src/bulk-ui.js`), the CSV review (`src/import-review.js`), the Needs voucher status, bulk actions on Students and Portal users (`src/bulk-engine.js`, reached through `store.bulk()`), and tests. A second plan, `docs/bulk-actions-implementation-plan.md`, appeared while this was being built. Its safety rules, permission checks and table chips were folded in. These choices differ from, or go beyond, this plan:

- **Open questions:** the defaults were used. Held invitations are allowed. A Needs voucher student cannot be enrolled on a course (the profile hides Manage training). There is no timeout. Undo lasts about 10 seconds, until the toast closes or you reload. A duplicate of an existing student is an error.
- **Removing a person opens one dialog** (row menu, edit dialogs, profile, bulk bar) with four choices: remove admin access, remove as a student, remove both and archive, or permanently delete all data. Permanent delete asks you to type DELETE, is Admin-only, and cannot be undone. It removes the person and their training records, and replaces their name in the activity log with "Deleted user". Choices that don't apply to the person are not shown.
- **Remove on Students is role-scoped.** This plan said "Remove from organisation (archive)"; the implementation plan said to remove only the student role, so someone who is also an admin keeps their portal access. The role-scoped version is built ("Remove as student"; the person is archived only if they hold no other role). The whole-person `remove` action still exists in the engine but no table offers it.
- **Events:** assigning a voucher to a Needs voucher student writes `student.voucher_changed` and `student.invite_released` (the new catalogue key), not `student.invited`. An import writes `student.invited` or `student.added_needs_voucher` per person plus `import.completed` with the file name and the counts of invited, needs voucher and excluded rows.
- **Drafts store names, not ids.** Saved import rows keep voucher, admin group and team as names, as the rest of the screens do. There can be several drafts (the implementation plan said one per person).
- **Preview rule:** a change is applied straight away with Undo, unless it clears an admin group, sends invitations to several people at once, or is destructive (suspend, remove). Then a preview dialog shows the effects first.
- **Permissions and safety (store-enforced, per row):** Admins change anyone; Limited Admins change only students in their voucher scope and only onto vouchers they manage; Viewers change no one; removing a whole person is Admin-only. You cannot suspend, demote or remove yourself, and the organisation always keeps one active Admin. Skipped rows are reported with a reason.
- **Undo** restores the people a bulk action changed, leaves alone anyone changed again since ("Changed since"), and logs `bulk.undone` for each. The original events stay. Resent invitations cannot be undone. It covers the last five actions in the current page session only.
- **Chips:** Students (All, Needs voucher, Pending invite, Suspended, No admin group, No team) and Portal users (All, Pending invite, Suspended, Admin, Limited Admin, Viewer), as well as the CSV review. Clicking a chip keeps the selection, and the bar says "N selected · M hidden by filters".
- **Keyboard:** Shift-click selects a range, Ctrl/Cmd-A selects all visible rows in a table, Esc clears the selection. The bulk bar docks to the bottom of the screen on phones. Changed rows flash briefly after a bulk action.
- **Students table:** the amber "Assign voucher" link sits under the status badge, because the table has no voucher column.
- **Not built:** the right-click row menu in the CSV review (the row's ⋮ menu has the same actions); disabling an action with a tooltip when it would skip every selected row; Undo from the Activity page; a progress indicator for selections over 200 rows; keeping the toast open while hovered; and "Update their assignments instead" for duplicate students (open question 5).
