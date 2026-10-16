# SANS Enterprise Portal prototype

This is a browser-only prototype. Source lives in `src/`; `build.mjs` embeds the source, styles, fonts and logo into the standalone `dist/index.html`.

## Source map and load order

The JavaScript load order is significant: `data.js` → `app.js` → `fidelity.js` → `people.js` → `tables.js`.

- `src/data.js`: v2 data schema, fictional seed records, voucher-to-admin-group mapping, CSV parsing and validation.
- `src/app.js`: base views, modal flows, event handlers and the `commit()` localStorage persistence boundary.
- `src/fidelity.js`: Figma-specific people tables, invitation flows, student drafts/results, CSV review and assignment pickers. It extends and overrides the base app.
- `src/people.js`: people-model v2 behaviour, including voucher-first choices, dual roles, account invitations and team membership versus access. It extends and overrides earlier behaviour.
- `src/tables.js`: sticky and frozen table behaviour, row menus and profile-page navigation. It loads last.
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
- Write all UI copy in modern UK English.
- Use sentence case for headings and labels.
- Preserve the offline, dependency-light client experience unless the task explicitly changes it.

## People-model rules

- Vouchers sit above Admin Groups. Choose vouchers first, then limit Admin Group choices to those covered by the chosen voucher or vouchers.
- A Limited Admin has exactly one voucher and may cover one or more Admin Groups within it.
- A student has exactly one required voucher, at most one optional Admin Group covered by that voucher, and at most one optional team.
- Team access and team membership are different: portal users receive access to teams; students are members of a team.
- One person may be both a portal user and a student, matched by email, but may not have duplicate records for the same role.
- Missing SANS accounts do not block invitations; those people remain in the awaiting-account state until simulated acceptance.
- SSO Admin remains future scope and is not offered in invitation flows.

