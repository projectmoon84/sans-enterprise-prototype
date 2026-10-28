# Activity log: notes for the production build

For developers taking this prototype to production. The prototype keeps events in browser storage; none of the guarantees below are enforced there. This page lists what the real service must enforce.

## What an event is

One row per change, shaped as in `docs/profile-and-activity-plan.md` ("Database v3 shape"). The fields that matter most:

| Field | Meaning |
|---|---|
| `at` | When it happened, as a UTC ISO 8601 timestamp. Show it in the viewer's time zone. |
| `actorId`, `actorName` | Who did it. `actorId` is a person id, `system` or `sans`. |
| `subjectId`, `subjectName` | Who it was done to. Empty for organisation-level events such as team creation. |
| `action` | A key from the event catalogue, for example `student.team_removed`. |
| `target`, `changes` | What was touched, and the before and after values. |
| `batchId`, `via` | Groups the events of one CSV import or bulk action, and says where the change came from. |

## Immutability

- **Append-only.** Never update or delete an event. A correction is a new event.
- **Written on the server, in the same transaction as the change.** If the change commits, its events commit; if it rolls back, they do not. The browser never writes events.
- **The actor comes from the authenticated session.** Never accept an `actorId` from the client. The prototype's "Sign in as…" switcher exists only for testing.
- **Name snapshots stay.** `actorName` and `subjectName` are copied when the event is written, so the log still reads correctly after a rename. Do not refresh them.
- **Archived people keep their events.** People are archived, not deleted.
- **Enforce it in the database.** Revoke `UPDATE` and `DELETE` on the events table for the application role, or use an append-only table or ledger service.

## Retention (open question 2)

- The prototype keeps everything. Decide the period with SANS before launch (for example, 2 years online, then archived).
- If events expire, expire whole days or whole batches, never single rows from the middle of a batch.
- If a person must be erased (open question 5), anonymise rather than delete: replace `actorName` and `subjectName` with "Deleted user" on their events and keep the rows. Do not remove events. The prototype does this ("Permanently delete all data" in the Remove dialog): the person, their training records and certifications are deleted; their event ids become `deleted-…`; earlier names and emails inside "details updated" events are blanked; and one `person.deleted` event is written. It is Admin-only, cannot be undone, and cannot delete yourself or the last active Admin.

## Who can see what (open question 1)

The prototype's default, implemented in `visibleEvents()` in `src/activity.js`:

- Admins and SSO Admins see every event.
- Limited Admins and Viewers see events about people who share one of their vouchers, plus the actions they took themselves.
- Events with no subject (team creation) are Admin-only.

Enforce this on the server. Filtering in the browser is a convenience only. Apply the same rule to the CSV export.

## Reading and exporting

- Index on `(subject_id, at)`, `(actor_id, at)`, `(action, at)` and `batch_id`. The profile and the Activity page filter on these.
- Page results with a cursor on `(at, id)`. The prototype pages by count only.
- The Activity page groups events that share a `batchId` into one expandable entry. Group in the API response so a batch is never split across pages.
- The CSV export (`eventsToCsv()`) quotes every cell and prefixes cells that start with `=`, `+`, `-` or `@` with an apostrophe so spreadsheets do not run them as formulas. Keep that in any server-side export.
- Log the export itself as an event. The prototype does not.

## Derived data

- **Alerts** (`src/alerts.js`) are calculated from current data and are never stored. Only the action taken on one is an event.
- **"Last modified by"** in the lists is the newest event for that person, ignoring `sans` actors and training or certification events. In production, keep a `last_modified_event_id` on the person row or read it from an indexed query. Do not scan the log per row.

## Events that come from SANS

`training.completed` and `certification.earned` arrive from SANS systems with `actorId: "sans"`. Ingest them idempotently, keyed on the SANS record id, so a retry does not create a duplicate.
