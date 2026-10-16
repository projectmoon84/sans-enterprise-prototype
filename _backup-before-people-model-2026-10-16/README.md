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
- Teams: create a team and assign students or portal users to it. Team and admin-group directories show their current members.
- Home: live record counts and an activity feed.
- Demo data: export/import a JSON database snapshot, export people as CSV, and reset to the original 9 portal users and 11 students.

Learning and Account & Finance contain supporting overview screens. Training delivery, real voucher balances, authentication, email delivery and external SANS account lookup are outside this prototype.

## A five-minute walkthrough

1. Open **Portal users → Invite Portal user**. Enter a new person, choose Viewer, select Federal Division, a voucher and at least one team, then review and confirm. The new record appears as Pending invite.
2. Edit the person. Change the status to Active to simulate accepting the invitation. Reload the page and search for their name to confirm persistence.
3. Open **Students → Add students → Individuals**. Add an email, voucher and required Sub-org, save the student, add another if desired, then review and send.
4. Open **Students → Add students → Upload a CSV** and choose the included sample-students.csv, or use **profile avatar → Use sample CSV**. The sample has one ready row and three needing attention (mock account failure, missing voucher, malformed email). Wait for 100%, click Continue, correct assignments in the review table, then click Done.
5. Open **profile avatar → Demo data**. Export a snapshot before resetting, or import a snapshot to load another reviewer's dataset.

The built-in sample is intended for a fresh/reset database. Using it again correctly flags already-imported email addresses as duplicates.

## Mock database behaviour

Records live in **localStorage** under `sans-enterprise-prototype-v1`. Every browser/profile has a separate database. Data persists after reloads and browser restarts until browser storage is cleared or reset. Moving between file opening and the local server creates separate storage contexts. Keep the localhost port unchanged to retain the same dataset.

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
- `src/app.js`: views, modal flows, interaction handlers, and the `commit()` persistence boundary. Database writes clone current state, persist it, then update the visible app.
- `src/styles.css` and `src/fidelity.css`: base presentation and measured Figma layout/component refinements. Fira Sans is bundled into the HTML at build time.
- `src/fidelity.js`: Figma-specific people tables, invitation steps, student draft/results, CSV progress/review and assignment pickers, reusing the existing persistence boundary.
- `src/assets/sans-logo.svg`: original vector logo exported from the supplied Figma file.
- `audit/report.html`: 16-state design coverage, review decisions, measurements and test evidence. Reference PNGs are in `audit/reference/`.
- `build.mjs`: creates the standalone HTML with embedded CSS, JavaScript and fonts.
- `tests/data.test.mjs`: data integrity, CSV quoting, duplicates, malformed records, and custom team coverage.

Database schema v1:

```text
{ version: 1, users: User[], teams: string[], groups: string[], activity: Activity[] }
User = { id, name, email, type: 'portal'|'student', role,
         groups: string[], teams: string[], vouchers: string[],
         status: 'Active'|'Pending invite'|'Suspended', workRole?, updatedAt }
Activity = { id, message, time }
```

## Review decisions and remaining product questions

The Figma invitation flow labels the selected role Admin while describing read-only capabilities. This prototype makes the summary role-dependent; confirm the exact permission matrix before production implementation.

The Figma student draft shows one ready student, while its review shows three, and its result combines a completed partial result with “Sending invitations”. This prototype derives counts and results from the records actually submitted. Import failures are actionable validation errors; external-account lookup uses deterministic mock fixtures, never a real SANS lookup.

The tall portal access dialog uses a scrollable body and visible action footer. The student continuation action is labelled **Save**, matching the source, and opens the review step. Unsaved rows must first be saved.

## Mock account fixtures

The demo treats valid emails as linked except these deliberate failure fixtures: `samira.khan@example.com`, `jane.doe@example.com`, `john.smith@example.com`, `susan.lee@example.com`, and `michael.brown@example.com`. Change a failed draft to another valid fictional address to exercise retry. Sending is timed locally; it never sends an email.

## Design review scope

The fidelity pass covers the 16 original frames inside the linked **Admin user management** section: Portal Users, Students, portal invite details/review/success, student details/review/results, four CSV upload states, CSV review, and three assignment pickers. Supporting Home, Learning, Account & Finance, directories, generic record editing, and demo utilities are functional additions with no corresponding reference frame in this section. Mobile is an adaptation because no mobile reference was supplied. See `audit/report.html` for explicit differences and verification limits.

## Validation

Six automated data tests pass. Browser checks cover portal invitation creation, role-dependent summaries, confirmation gating, editing multiple access assignments, persistence after reload, live search, individual student creation, CSV validation, row correction, and importing valid rows while retaining invalid ones. The subsequent independent fidelity/behaviour review also checked draft preservation, repeated assignments, searchable assignment pickers, partial-send failure/retry, CSV progress waiting for Continue, and narrow-screen invitation controls. Six data tests pass; these are not automated screenshot regression tests. The design detector returned zero findings. Final package checks include embedded assets, JavaScript syntax, archive contents and launcher syntax.

Fira Sans is distributed under the SIL Open Font License; see `src/fonts/OFL.txt` (or `FONT-LICENSE.txt` in the client package).
