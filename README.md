# SANS Enterprise Portal — local prototype

A functional HTML prototype based on the linked **Admin user management** section of the SANS Enterprise Dashboard Figma file. The reference page is Phase 01 v0.4 [WIP].

## Run the client package

Unzip **SANS Enterprise Prototype.zip** before opening files.

- **Mac:** double-click `Start on Mac.command`.
- **Windows:** double-click `Start on Windows.bat`.
- The launcher needs **Python 3**, uses only its standard library, and opens `http://127.0.0.1:5189/`. Keep its terminal window open; press Ctrl+C to stop.
- If a Mac blocks the downloaded launcher, use Terminal in the extracted folder and run `python3 serve.py`.
- You can also open the included `index.html` directly in a modern browser. All scripts, styles, and fonts are embedded. Direct-file browser storage varies; the local launcher is the supported way to keep demo data reliably.

No npm installation, account, internet connection, or cloud database is needed to use the client package. The launchers themselves were inspected; the HTTP-served HTML was exercised in the browser. Automated preview cannot open `file://` pages, so direct-file behaviour should be checked in your preferred browser.

## What works

- Portal users: invite with email, select role and multiple admin groups/vouchers/teams, review access, confirm and save a pending invitation.
- The permission summary responds to the selected role. These are **proposed demo permissions**, not an authoritative SANS access-control specification.
- Students: save multiple draft students, edit/remove draft rows, review, confirm, and create records.
- CSV import: download a template, use the built-in sample, or upload a real CSV; validate email, duplicates, voucher, admin group and team; correct or remove rows; add ready rows, with an explicit choice to keep reviewing or finish while excluding invalid rows.
- Records: search, filter, edit details and assignments, change status, simulate invitation acceptance by selecting Active, and delete demo records.
- CSV review: rows are checked as you go (Ready, Needs voucher, Error). Fix cells with a pop-over, fix many rows at once from the bulk bar, and press Done. Rows without a voucher are added as **Needs voucher** and are not invited until a voucher is assigned. An unfinished import is saved and can be resumed from Students.
- Bulk actions on Students and Portal users: select rows to get a bulk bar (assign voucher, admin group, team, role, access; resend, suspend, remove; export). Changes with side effects show a preview, most show an **Undo** for about 10 seconds, and rows that can't be changed are skipped with a reason. Quick-filter chips sit above both tables.
- Teams: create a team and assign students to it. Team and admin-group pages show **members** (students) separately from **portal users with access**.
- Home: live record counts and an activity feed.
- Demo data: export/import a JSON database snapshot, export people as CSV, and reset to the original demo data (9 portal users and 14 student records, two of which belong to portal users).

Learning and Account & Finance contain supporting overview screens. Training delivery, real voucher balances, authentication, email delivery and external SANS account lookup are outside this prototype.

## A five-minute walkthrough

1. Open **Portal users → Invite Portal user**. Enter a new person, choose Viewer, select Federal Division, a voucher and at least one team, then review and confirm. The new record appears as Pending invite.
2. Edit the person. Change the status to Active to simulate accepting the invitation. Reload the page and search for their name to confirm persistence.
3. Open **Students → Add students → Individuals**. Add an email, then a voucher. The Admin Group list narrows to the groups that voucher covers (optional). Save the student, add another if desired, then review and send. Try `marcus.okonjo@example.com` to see a portal user being added as a student, or `samira.khan@example.com` to see someone without a SANS account being invited to create one.
4. Open **Students → Add students → Upload a CSV** and choose the included sample-students.csv, or use **profile avatar → Use sample CSV**. The sample has two ready rows (one of them needs a new SANS account) and three needing attention: a missing voucher, a malformed email and an admin group outside its voucher. Wait for 100%, click Continue, correct assignments in the review table, then click Done.
5. Open **profile avatar → Demo data**. Export a snapshot before resetting, or import a snapshot to load another reviewer's dataset.

The built-in sample is intended for a fresh/reset database. Using it again correctly flags already-imported email addresses as duplicates.

## Mock database behaviour

Records live in **localStorage** under `sans-enterprise-prototype-v3`. Data saved under the old v2 key is migrated automatically on first load. Every browser/profile has a separate database. Data persists after reloads and browser restarts until browser storage is cleared or reset. Moving between file opening and the local server creates separate storage contexts. Keep the localhost port unchanged to retain the same dataset.

The zip contains the original seed data, never records from the author's browser. Sharing an updated dataset requires exporting a JSON snapshot and having the recipient import it. Drafts and uncommitted CSV rows are held in memory and disappear on reload.

This is mock application state, not a database server. Invitations are simulated; no emails are sent. Use fictional information. A later hosted version can replace the persistence boundary with an authenticated API and a shared database.

## Developer source

Source is in `src/`; `dist/index.html` is the generated standalone app. The client zip includes a `developer/` folder with the same editable source and tests.

Requires Node.js 20+ to rebuild. There are no npm dependencies:

```sh
npm run check
npm test
npm run build
python3 serve.py
```

- `src/data.js`: record schema, fictional seed records, CSV parser and validation.
- `src/store.js`: database v3, v2 migration and the command layer. Every change is a named function that validates, applies, logs and saves in one step; a failed command leaves data untouched. Deleting archives the person.
- `src/activity.js`: structured event wording and activity filtering. The seeded database includes realistic history and the current actor comes from the profile menu’s “Sign in as…” switcher.
- `src/app.js`: views, modal flows and interaction handlers. `dispatch()` calls a store command, then refreshes the visible app.
- `src/styles.css` and `src/fidelity.css`: base presentation and measured Figma layout/component refinements. Fira Sans is bundled into the HTML at build time.
- `src/tables.js`: table behaviour: sticky header row, frozen checkbox, name and ⋮ columns, right-click row menu, and click-a-row to open the placeholder profile page. Loaded after people.js.
- `src/people.js`: people model v2 (voucher-first admin groups, dual roles, SANS account invites, team membership vs access). Loaded last.
- `src/fidelity.js`: Figma-specific people tables, invitation steps, student draft/results, CSV progress/review and assignment pickers, reusing the existing persistence boundary.
- `src/assets/sans-logo.svg`: original vector logo exported from the supplied Figma file.
- `audit/report.html`: 16-state design coverage, review decisions, measurements and test evidence. Reference PNGs are in `audit/reference/`.
- `build.mjs`: creates the standalone HTML with embedded CSS, JavaScript and fonts.
- `tests/data.test.mjs`: data integrity, CSV quoting, duplicates, malformed records, and custom team coverage.

Database schema v2 (legacy; still imported and migrated). The current v3 shape is documented in `docs/profile-and-activity-plan.md` and `src/store.js`:

```text
{ version: 2, users: User[], teams: string[], groups: string[], activity: Activity[] }
User = { id, name, email, type: 'portal'|'student', role,
         groups: string[], teams: string[], vouchers: string[],
         status: 'Active'|'Pending invite'|'Suspended', accountSetup?: boolean,
         workRole?, updatedAt }
// Students: exactly 1 voucher, at most 1 admin group and 1 team.
// The same email may exist once as 'portal' and once as 'student' (one person, two roles).
Activity = { id, message, time }
```

## Tables

- **Frozen columns:** the checkbox and Name columns stay put while the rest scroll sideways, and the ⋮ column stays pinned on the right. A soft shadow shows when there's more to scroll.
- **Sticky header:** the header row sticks just under the top bar as the page scrolls. It sits in its own table that is kept in step with the body's sideways scroll.
- **Right-click** anywhere on a row to open that row's ⋮ menu at the pointer. On the CSV review table, right-click opens the row's correction dialog, which is what its ⋮ does.
- **Left-click** a row, or press Enter on a focused row, to open the person's profile page. Clicks on checkboxes, tags, links and menus keep their own behaviour. The profile page is a placeholder until it's specced.

## People model (agreed 16 Oct 2026)

- **Admin Groups** is the only name used for organisational sub-divisions (no "Sub-org" or "Organisational reach").
- **Vouchers sit at the top level.** Choosing a voucher narrows the admin groups on offer. The voucher-to-admin-group mapping is mock data in `src/data.js` (`VOUCHER_GROUPS`) and is waiting for SANS to confirm it. Teams are never filtered, because one team can include students from different vouchers.
- **Students** hold exactly one voucher (required), plus at most one admin group and one team (both optional).
- **Approvals:** Admins and Limited Admins approve training requests within their scope. Admins also manage voucher settings, teams and portal users. A Limited Admin is scoped to **one voucher** (single choice) but can cover **one or more admin groups** within it.
- **Team access is not team membership.** Portal users get _access_ to teams. Students are _members_ of a team.
- **One person, two roles.** The same email can be both a portal user and a student. Both invite flows detect the match, tables show an "Also a student" or "Also a portal user" tag, and row menus offer "Add as student" or "Invite as portal user".
- **No SANS account found** does not block an invitation. The person is invited to create an account, shows "Awaiting SANS account" until they accept, and is then added automatically (simulate this by setting the status to Active).
- **SSO Admin** stays in the data as a future-scope role. It isn't offered when inviting.

The people-model logic lives in `src/people.js`, which loads after `src/fidelity.js` and overrides parts of it.

## Review decisions and remaining product questions

The Figma invitation flow labels the selected role Admin while describing read-only capabilities. This prototype makes the summary role-dependent; confirm the exact permission matrix before production implementation.

The Figma student draft shows one ready student, while its review shows three, and its result combines a completed partial result with “Sending invitations”. This prototype derives counts and results from the records actually submitted. Import failures are actionable validation errors; external-account lookup uses deterministic mock fixtures, never a real SANS lookup.

The tall portal access dialog uses a scrollable body and visible action footer. The student continuation action is labelled **Save**, matching the source, and opens the review step. Unsaved rows must first be saved.

## Mock account fixtures

The demo treats valid emails as already linked to a SANS account, except these fixtures, which simulate "no SANS account found": `samira.khan@example.com`, `jane.doe@example.com`, `john.smith@example.com`, `susan.lee@example.com` and `michael.brown@example.com`. These people are still invited. They are asked to create an account first and appear as "Awaiting SANS account". Sending is timed locally and never sends an email.

## Design review scope

The fidelity pass covers the 16 original frames inside the linked **Admin user management** section: Portal Users, Students, portal invite details/review/success, student details/review/results, four CSV upload states, CSV review, and three assignment pickers. Supporting Home, Learning, Account & Finance, directories, generic record editing, and demo utilities are functional additions with no corresponding reference frame in this section. Mobile is an adaptation because no mobile reference was supplied. See `audit/report.html` for explicit differences and verification limits.

## Validation

Ten automated data tests pass. Browser checks cover portal invitation creation, role-dependent summaries, confirmation gating, editing multiple access assignments, persistence after reload, live search, individual student creation, CSV validation, row correction, and importing valid rows while retaining invalid ones. The subsequent independent fidelity/behaviour review also checked draft preservation, repeated assignments, searchable assignment pickers, partial-send failure/retry, CSV progress waiting for Continue, and narrow-screen invitation controls. Ten data tests pass; these are not automated screenshot regression tests. The design detector returned zero findings. Final package checks include embedded assets, JavaScript syntax, archive contents and launcher syntax.

Fira Sans is distributed under the SIL Open Font License; see `src/fonts/OFL.txt` (or `FONT-LICENSE.txt` in the client package).

Icons use Google's **Material Symbols Outlined** (weight 300, matching the Figma designs). `src/fonts/material-symbols-outlined.woff2` is a trimmed copy (about 4 KB) holding only the icons this prototype uses, so it still works offline. Icons are referenced by name through `icon('name')` in `src/app.js`. To add an icon, add its codepoint to the `MS` list there and re-run the font trim with fontTools (`pyftsubset`) against the `material-symbols` npm package. Material Symbols is licensed under Apache 2.0; see `MATERIAL-SYMBOLS-LICENSE.txt`.
