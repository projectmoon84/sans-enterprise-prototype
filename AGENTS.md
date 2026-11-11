# SANS Enterprise Portal prototype

This is a browser-only prototype. Source lives in `src/`; `build.mjs` embeds the source, styles, fonts and logo into the standalone `dist/index.html`.

## Source map and load order

The JavaScript load order is significant: `data.js` → `training.js` → `bulk-engine.js` → `alerts.js` → `store.js` → `activity.js` → `app.js` → `fidelity.js` → `people.js` → `tables.js` → `profile.js` → `activity-page.js` → `bulk-ui.js` → `import-review.js` → `teams.js` → `motion.js` → `handover-adapter.js` (after the embedded handover layer).

- `src/data.js`: v2 data schema, fictional seed records, voucher-to-admin-group mapping, CSV parsing and validation.
- `src/training.js`: mock SANS course catalogue, GIAC certifications, seeded training histories and certification-status helpers. Pure functions with no store import; loaded before `store.js`.
- `src/alerts.js`: `alertsFor()` works out Needs attention alerts from the data (never stored), plus `personPermissions()` for what the signed-in user may do. Pure functions.
- `src/bulk-ui.js`: toast with Undo, cell pop-over, bulk action bar, quick-filter chips and preview dialog, plus the Students banners and "Needs voucher" flag.
- `src/import-review.js`: the CSV review screen, saved import drafts and the Done dialogs.
- `src/teams.js`: the Teams list (cards by default, rows toggle, health strip, filters, sort, bulk delete) and the team page (Members, Portal users with access and History tabs, member bulk bar, add students side panel, create, edit and delete). Member changes run through `store.bulk()` so they share permissions, events and Undo.
- `src/handover-adapter.js`: connects the portable handover layer (`handover/layer/handover-layer.js`) to this prototype: view names, navigation and how to reveal panels and dialogs. See `handover/README.md`.
- `src/motion.js`: screen and dialog entrances. Wraps `navigate()` and `openModal()` last, so it animates only real screen changes and dialog steps, never ordinary re-renders. Respects reduced motion.
- `src/activity-page.js`: the global Activity page (filters, batch grouping, CSV export). Reuses entry markup from `profile.js`.
- `src/bulk-engine.js`: bulk actions on people (voucher, admin group, team, status, resend, remove, portal access, role). Pure; returns applied / unchanged / skipped / cleared lists. Reached through `store.bulk()`, which also supports `dryRun` previews and `undo()`.
- `src/store.js`: database v3 (people with attached portal/student roles, id-based directories, session and append-only events), the v2 migration, read helpers and one command per data change. Screens change data only through these commands (via `dispatch()` in `app.js`); never mutate `db` directly. `store.view()` gives the flat per-role rows the screens read.
- `src/activity.js`: event descriptions and person activity filtering. Keep event wording keyed by the event catalogue in the profile and activity plan.
- `src/app.js`: base views, modal flows and event handlers. `dispatch()` runs a store command, then refreshes `db` and re-renders.
- `src/fidelity.js`: Figma-specific people tables, invitation flows, student drafts/results, CSV review and assignment pickers. It extends and overrides the base app.
- `src/people.js`: people-model v2 behaviour, including voucher-first choices, dual roles, account invitations and team membership versus access. It extends and overrides earlier behaviour.
- `src/tables.js`: sticky and frozen table behaviour, row menus and profile-page navigation.
- `src/profile.js`: full person profile view, profile-specific edit flows and role-aware permissions.
- `src/styles.css`: base layout and component styles.
- `src/fidelity.css`: measured Figma refinements and styles for the later people and table layers.
- `src/index.html`: the minimal shell used by the standalone build.

Do not reorder these layers without checking the overrides in the later files.

## Commands

Run commands from this directory:

```sh
npm run check
npm test
npm run build
python3 serve.py
```

After any source change, run the syntax check, tests and build. Use `http://127.0.0.1:5189/` for browser verification.

## Editing rules

- Never edit `dist/` or `release/` by hand. They are generated outputs. Change `src/`, then run the build or packaging workflow.
- Write all UI copy in US English (organization, color, canceled). This is an American client.
- Use title case for headings, labels, navigation and buttons, matching the client's house style.
- Preserve the offline, dependency-light client experience unless the task explicitly changes it.

## People-model rules

- Vouchers sit above Admin Groups. Choose vouchers first, then limit Admin Group choices to those covered by the chosen voucher or vouchers.
- A Limited Admin has exactly one voucher and may cover one or more Admin Groups within it.
- A student has exactly one required voucher, at most one optional Admin Group covered by that voucher, and at most one optional team.
- Team access and team membership are different: portal users receive access to teams; students are members of a team.
- One person may be both a portal user and a student, matched by email, but may not have duplicate records for the same role.
- A student imported without a voucher is saved as **Needs voucher**: no invitation is sent until a voucher is assigned, which releases it. `voucherId` is present exactly when the status is not Needs voucher. Rows are checked with `checkStudentRow()` in `data.js`, the one shared rule set.
- Removing a person always goes through the Remove dialog (`openRemoveDialog()` in `bulk-ui.js`): remove admin access, remove as a student, remove both and archive, or permanently delete. Permanent delete anonymises the activity log rather than deleting events.
- Missing SANS accounts do not block invitations; those people remain in the awaiting-account state until simulated acceptance.
- SSO Admin remains future scope and is not offered in invitation flows.
- SANS staff (`SANS_STAFF` in `fidelity.js`) are not people in the customer organization and are kept out of the database. Sign in as one from the avatar menu; only SANS staff see the SANS Administration section of the sidebar and its pages. In the organization's own pages they act with full Admin rights, as the organization's first Admin.

## Handover notes

Design changes are documented for developers with the handover layer (Alt+H in the running prototype) and `handover/cli.mjs`. Notes live in `handover/data.json`. When you add a component worth annotating, give it `data-spec="area.component"` and `data-spec-label`. Keep existing `data-spec` names stable, because notes are attached to them. Read `handover/README.md` before changing the layer or the tool.
