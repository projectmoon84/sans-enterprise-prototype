import test from "node:test";
import assert from "node:assert/strict";
import { createStore, normaliseDatabase, seedDatabase } from "../src/store.js";
import { checkStudentRow, rowStatus, validateCandidate } from "../src/data.js";
import { describeEvent, groupBatches, batchHeadline, plainText } from "../src/activity.js";
import { alertsFor, personPermissions } from "../src/alerts.js";

const V1 = "Cyber Defense FY26";
const V2 = "Offensive Ops FY26";
const row = (over = {}) => ({ name: "New", email: "new@example.com", voucher: V1, ...over });
const rowIds = (store, filter) =>
  store.view().users.filter(filter).map((u) => u.id);
const students = (store) => store.view().users.filter((u) => u.type === "student");

// ---- row rules
test("checkStudentRow gives errors, needs-voucher and info, with a worst-wins status", () => {
  const ok = checkStudentRow(row(), { requireVoucher: false });
  assert.equal(rowStatus(ok), "ready");
  const missing = checkStudentRow(row({ voucher: "" }), { requireVoucher: false });
  assert.deepEqual(missing.map((p) => [p.level, p.code, p.field]), [["needsVoucher", "missing_voucher", "voucher"]]);
  assert.equal(rowStatus(missing), "needsVoucher");
  const bad = checkStudentRow(row({ email: "nope", voucher: "" }), { requireVoucher: false });
  assert.equal(rowStatus(bad), "error");
  assert.ok(bad.some((p) => p.code === "invalid_email") && bad.some((p) => p.code === "missing_voucher"));
  const info = checkStudentRow(row(), { requireVoucher: false, accountExists: () => false });
  assert.equal(rowStatus(info), "ready");
  assert.deepEqual(info.map((p) => p.level), ["info"]);
});

test("a missing voucher is an error in the forms but only needs-voucher in the review", () => {
  assert.deepEqual(validateCandidate(row({ voucher: "" })), ["Choose a valid voucher"]);
  assert.equal(rowStatus(checkStudentRow(row({ voucher: "" }), { requireVoucher: false })), "needsVoucher");
});

test("admin groups must be covered by the voucher; without a voucher there is nothing to check", () => {
  assert.ok(checkStudentRow(row({ voucher: V2, group: "APAC Operations" })).some((p) => p.code === "group_not_covered"));
  assert.equal(rowStatus(checkStudentRow(row({ voucher: "", group: "APAC Operations" }), { requireVoucher: false })), "needsVoucher");
});

test("duplicates and existing students are errors", () => {
  const a = row();
  const b = row();
  assert.ok(checkStudentRow(a, { batch: [a, b] }).some((p) => p.code === "duplicate_email"));
  assert.ok(checkStudentRow(a, { existing: [{ email: "NEW@example.com", type: "student" }] }).some((p) => p.code === "already_student"));
});

// ---- Needs voucher import
const importRows = [
  { name: "Has Voucher", email: "has.voucher@example.com", voucher: V1 },
  { name: "No Voucher", email: "no.voucher@example.com", voucher: "" },
  { name: "Also None", email: "also.none@example.com", voucher: "", group: "Federal Division" },
];

test("importing rows without a voucher saves them as Needs voucher and reports the counts", () => {
  const store = createStore();
  const out = store.commitCsvImport(importRows, { fileName: "october.csv" });
  assert.equal(out.ids.length, 3);
  assert.equal(out.invited, 1);
  assert.equal(out.needsVoucher, 2);
  const snap = store.snapshot();
  const held = snap.people.find((p) => p.email === "no.voucher@example.com");
  assert.equal(held.student.status, "Needs voucher");
  assert.equal(held.student.voucherId, undefined);
  assert.equal(snap.people.find((p) => p.email === "has.voucher@example.com").student.status, "Pending invite");
  const events = snap.events.filter((e) => e.batchId === out.batchId);
  assert.deepEqual([...new Set(events.map((e) => e.action))].sort(), ["import.completed", "student.added_needs_voucher", "student.invited"]);
  assert.ok(events.every((e) => e.via === "csv"));
  const summary = events.find((e) => e.action === "import.completed");
  assert.equal(summary.changes.find((c) => c.field === "file").to, "october.csv");
});

test("the forms still refuse a student without a voucher", () => {
  const store = createStore();
  assert.throws(() => store.addStudent({ name: "X", email: "x@example.com", voucher: "" }), /valid voucher/);
});

test("the database rule: a voucher is present exactly when the student is not waiting for one", () => {
  const store = createStore();
  store.commitCsvImport(importRows);
  const data = store.snapshot();
  const waiting = data.people.find((p) => p.student?.status === "Needs voucher");
  const broken = structuredClone(data);
  broken.people.find((p) => p.id === waiting.id).student.voucherId = data.vouchers[0].id;
  assert.throws(() => normaliseDatabase(broken), /invalid student details/);
  const other = structuredClone(data);
  const active = other.people.find((p) => p.student?.status === "Active");
  delete active.student.voucherId;
  assert.throws(() => normaliseDatabase(other), /invalid student details/);
});

test("Needs voucher students are held: no resend, status change, or course", () => {
  const store = createStore();
  store.commitCsvImport(importRows);
  const row = students(store).find((u) => u.status === "Needs voucher");
  assert.throws(() => store.resendInvite(row.id), /No invitation has been sent/);
  assert.throws(() => store.changeStatus(row.id, "Active"), /Assign a voucher/);
  assert.throws(() => store.assignCourse(row.personId, { courseId: store.snapshot().courses[0].id }), /Assign a voucher/);
  const r = store.bulk("resend", [row.id]);
  assert.equal(r.skipped[0].reason, "No invitation has been sent yet");
});

test("assigning a voucher releases the held invitation and logs it", () => {
  const store = createStore();
  store.commitCsvImport(importRows);
  const ids = rowIds(store, (u) => u.type === "student" && u.status === "Needs voucher");
  assert.equal(ids.length, 2);
  const r = store.bulk("voucher", ids, { voucher: V1 });
  assert.equal(r.applied.length, 2);
  assert.equal(r.invitesReleased, 2);
  const after = students(store).filter((u) => ids.includes(u.id));
  assert.ok(after.every((u) => u.status === "Pending invite" && u.vouchers[0] === V1));
  const events = store.snapshot().events.filter((e) => e.batchId === r.batchId);
  assert.equal(events.filter((e) => e.action === "student.voucher_changed").length, 2);
  assert.equal(events.filter((e) => e.action === "student.invite_released").length, 2);
  assert.ok(events.every((e) => e.via === "bulk"));
  assert.match(plainText(describeEvent(events.find((e) => e.action === "student.invite_released"))), /sent .* student invitation after assigning a voucher/);
});

test("the edit dialog path also releases the invitation when a voucher is chosen", () => {
  const store = createStore();
  store.commitCsvImport(importRows);
  const held = students(store).find((u) => u.status === "Needs voucher");
  store.editStudentDetails(held.id, { name: held.name, email: held.email, voucher: V1, group: "", team: "", workRole: "Student", status: "" });
  const after = store.snapshot().people.find((p) => p.id === held.personId);
  assert.equal(after.student.status, "Pending invite");
  assert.ok(store.snapshot().events.some((e) => e.action === "student.invite_released" && e.subjectId === held.personId));
});

// ---- bulk student actions
test("changing voucher clears admin groups it does not cover, and reports who", () => {
  const store = createStore();
  const target = students(store).find((u) => u.groups.includes("EMEA Operations") && u.vouchers[0] !== V2);
  assert.ok(target, "seed has a student in EMEA Operations");
  const preview = store.bulk("voucher", [target.id], { voucher: V2 }, { dryRun: true });
  assert.equal(preview.cleared.length, 1);
  assert.equal(preview.cleared[0].value, "EMEA Operations");
  assert.equal(students(store).find((u) => u.id === target.id).groups[0], "EMEA Operations", "a preview changes nothing");
  const r = store.bulk("voucher", [target.id], { voucher: V2 });
  assert.equal(students(store).find((u) => u.id === target.id).groups.length, 0);
  assert.equal(r.cleared.length, 1);
});

test("assigning an admin group only works where the voucher covers it, and skips rows without a voucher", () => {
  const store = createStore();
  store.commitCsvImport(importRows);
  const mixed = [
    ...rowIds(store, (u) => u.type === "student" && u.status === "Needs voucher"),
    ...rowIds(store, (u) => u.type === "student" && u.vouchers[0] === V2).slice(0, 2),
  ];
  const r = store.bulk("adminGroup", mixed, { group: "APAC Operations" });
  assert.equal(r.applied.length, 0);
  const reasons = r.skipped.map((s) => s.reason);
  assert.ok(reasons.some((x) => /Needs a voucher/.test(x)));
  assert.ok(reasons.some((x) => /not covered by Offensive Ops FY26/.test(x)));
  const ok = store.bulk("adminGroup", rowIds(store, (u) => u.type === "student" && u.vouchers[0] === V2).slice(0, 2), { group: "Federal Division" });
  assert.equal(ok.skipped.length, 0);
});

test("add to team replaces any existing team; clearing removes it; already-set rows are unchanged", () => {
  const store = createStore();
  const a = students(store).find((u) => u.teams[0] && u.teams[0] !== "Incident Response");
  store.createTeam("Incident Response");
  const r = store.bulk("team", [a.id], { team: "Incident Response" });
  assert.equal(students(store).find((u) => u.id === a.id).teams[0], "Incident Response");
  assert.equal(r.applied.length, 1);
  assert.equal(store.bulk("team", [a.id], { team: "Incident Response" }).unchanged.length, 1);
  store.bulk("team", [a.id], { team: "" });
  assert.equal(students(store).find((u) => u.id === a.id).teams.length, 0);
  const actions = store.snapshot().events.filter((e) => e.subjectId === a.personId).map((e) => e.action);
  assert.ok(actions.includes("student.team_changed") && actions.includes("student.team_removed"));
});

test("resend only touches pending invitations and says why the others were skipped", () => {
  const store = createStore();
  const rows = students(store).slice(0, 8);
  const pending = rows.filter((u) => u.status === "Pending invite");
  const r = store.bulk("resend", rows.map((u) => u.id));
  assert.equal(r.applied.length, pending.length);
  assert.equal(r.skipped.length, rows.length - pending.length);
  assert.ok(r.skipped.every((s) => /Only pending invitations/.test(s.reason)));
});

test("suspend and reactivate report unchanged rows; remove archives each person once", () => {
  const store = createStore();
  const active = students(store).filter((u) => u.status === "Active").slice(0, 3);
  const first = store.bulk("status", active.map((u) => u.id), { status: "Suspended" });
  assert.equal(first.applied.length, 3);
  assert.equal(store.bulk("status", active.map((u) => u.id), { status: "Suspended" }).unchanged.length, 3);
  const dual = store.view().users.filter((u) => u.email === "tom.halloway@example.com");
  assert.equal(dual.length, 2);
  const gone = store.bulk("remove", dual.map((u) => u.id));
  assert.equal(gone.applied.length, 1, "both rows, one person");
  assert.ok(store.snapshot().people.find((p) => p.id === dual[0].personId).archivedAt);
});

test("every person in a bulk action gets one event with the shared batchId and via bulk", () => {
  const store = createStore();
  const ids = students(store).filter((u) => u.status === "Active").slice(0, 4).map((u) => u.id);
  const r = store.bulk("status", ids, { status: "Suspended" });
  const events = store.snapshot().events.filter((e) => e.batchId === r.batchId);
  assert.equal(events.length, 4);
  assert.equal(new Set(events.map((e) => e.subjectId)).size, 4);
  assert.ok(events.every((e) => e.via === "bulk"));
  const entry = groupBatches(events)[0];
  assert.equal(entry.type, "batch");
  assert.match(plainText(batchHeadline(entry)), /suspended 4 people/);
});

// ---- undo
test("undo restores the people, logs bulk.undone, and keeps the original history", () => {
  const store = createStore();
  const ids = students(store).filter((u) => u.status === "Active").slice(0, 3).map((u) => u.id);
  const before = store.view().users.filter((u) => ids.includes(u.id)).map((u) => u.status);
  const r = store.bulk("status", ids, { status: "Suspended" });
  const eventCount = store.snapshot().events.length;
  assert.deepEqual(store.undo(r.undoId), { restored: 3, skipped: [] });
  assert.deepEqual(store.view().users.filter((u) => ids.includes(u.id)).map((u) => u.status), before);
  const snap = store.snapshot();
  assert.equal(snap.events.length, eventCount + 3, "undo adds events, removes none");
  assert.equal(snap.events.filter((e) => e.action === "bulk.undone").length, 3);
  assert.ok(snap.events.filter((e) => e.batchId === r.batchId).length === 3, "original events remain");
  assert.match(plainText(describeEvent(snap.events.find((e) => e.action === "bulk.undone"))), /undid suspending for /);
  assert.throws(() => store.undo(r.undoId), /can no longer be undone/);
});

test("undoing a voucher assignment puts a student back to Needs voucher", () => {
  const store = createStore();
  store.commitCsvImport(importRows);
  const ids = rowIds(store, (u) => u.type === "student" && u.status === "Needs voucher");
  const r = store.bulk("voucher", ids, { voucher: V1 });
  store.undo(r.undoId);
  assert.ok(students(store).filter((u) => ids.includes(u.id)).every((u) => u.status === "Needs voucher"));
});

test("a failed or empty bulk action has no undo and changes nothing", () => {
  const store = createStore();
  const before = JSON.stringify(store.snapshot());
  const r = store.bulk("status", [], { status: "Suspended" });
  assert.equal(r.undoId, undefined);
  assert.throws(() => store.bulk("voucher", ["x"], { voucher: "Nope" }), /valid voucher/);
  assert.equal(JSON.stringify(store.snapshot()), before);
});

// ---- portal bulk actions
const portals = (store) => store.view().users.filter((u) => u.type === "portal");
const limited = (store) => portals(store).filter((u) => u.role === "Limited Admin");

test("portal team access: add, remove and replace", () => {
  const store = createStore();
  const ids = portals(store).filter((u) => u.role === "Viewer").slice(0, 2).map((u) => u.id);
  store.createTeam("Blue Team");
  store.bulk("portalAccess", ids, { field: "team", mode: "add", names: ["Blue Team"] });
  assert.ok(portals(store).filter((u) => ids.includes(u.id)).every((u) => u.teams.includes("Blue Team")));
  store.bulk("portalAccess", ids, { field: "team", mode: "remove", names: ["Blue Team"] });
  assert.ok(portals(store).filter((u) => ids.includes(u.id)).every((u) => !u.teams.includes("Blue Team")));
  store.bulk("portalAccess", ids, { field: "team", mode: "replace", names: ["Blue Team"] });
  assert.ok(portals(store).filter((u) => ids.includes(u.id)).every((u) => u.teams.length === 1 && u.teams[0] === "Blue Team"));
  const events = store.snapshot().events.filter((e) => e.via === "bulk" && /team_access/.test(e.action));
  assert.ok(events.length >= 6);
});

test("Limited Admins are skipped when a second voucher would be added", () => {
  const store = createStore();
  const lim = limited(store);
  assert.ok(lim.length);
  const viewer = portals(store).find((u) => u.role === "Viewer");
  const spare = ["Cyber Defense FY26", "Cloud Security FY26", "Offensive Ops FY26", "Leadership FY26"].find((v) => !lim[0].vouchers.includes(v) && !viewer.vouchers.includes(v));
  const r = store.bulk("portalAccess", [lim[0].id, viewer.id], { field: "voucher", mode: "add", names: [spare] });
  assert.ok(r.skipped.some((s) => s.id === lim[0].id && /only have one voucher/.test(s.reason)));
  assert.ok(r.applied.some((s) => s.id === viewer.id));
  assert.equal(portals(store).find((u) => u.id === lim[0].id).vouchers.length, 1);
});

test("admin group access is limited to groups the person's vouchers cover", () => {
  const store = createStore();
  const person = portals(store).find((u) => u.name === "Ines Duarte");
  assert.deepEqual(person.vouchers, [V2]);
  const r = store.bulk("portalAccess", [person.id], { field: "adminGroup", mode: "add", names: ["APAC Operations"] });
  assert.match(r.skipped[0].reason, /not covered by their vouchers/);
});

test("removing the last voucher or admin group is skipped, not half-applied", () => {
  const store = createStore();
  const one = limited(store)[0];
  const r = store.bulk("portalAccess", [one.id], { field: "voucher", mode: "remove", names: one.vouchers });
  assert.match(r.skipped[0].reason, /at least one voucher/);
  const g = store.bulk("portalAccess", [one.id], { field: "adminGroup", mode: "remove", names: one.groups });
  assert.match(g.skipped[0].reason, /at least one admin group/);
});

test("replacing vouchers drops the admin groups they do not cover and reports them", () => {
  const store = createStore();
  const ada = portals(store).find((u) => u.email === "ada.whitfield@example.com");
  assert.equal(ada.groups.length, 3);
  const preview = store.bulk("portalAccess", [ada.id], { field: "voucher", mode: "replace", names: [V2] }, { dryRun: true });
  assert.equal(preview.skipped.length, 0);
  assert.deepEqual(preview.cleared.map((c) => c.value).sort(), ["APAC Operations", "EMEA Operations"]);
  assert.equal(portals(store).find((u) => u.id === ada.id).vouchers.length, 4, "a preview changes nothing");
  store.bulk("portalAccess", [ada.id], { field: "voucher", mode: "replace", names: [V2] });
  const after = portals(store).find((u) => u.id === ada.id);
  assert.deepEqual([after.vouchers, after.groups], [[V2], ["Federal Division"]]);
});

test("changing a role to Limited Admin keeps one voucher and says what was dropped", () => {
  const store = createStore();
  const ada = portals(store).find((u) => u.email === "ravi.nair@example.com");
  const preview = store.bulk("role", [ada.id], { role: "Limited Admin" }, { dryRun: true });
  assert.equal(preview.skipped.length, 0);
  assert.equal(preview.cleared.filter((c) => c.field === "voucher").length, 3);
  assert.deepEqual(preview.cleared.filter((c) => c.field === "admin group").map((c) => c.value), ["APAC Operations"]);
  store.bulk("role", [ada.id], { role: "Limited Admin" });
  const after = portals(store).find((u) => u.id === ada.id);
  assert.equal(after.role, "Limited Admin");
  assert.equal(after.vouchers.length, 1);
  assert.deepEqual(after.groups, ["Federal Division", "EMEA Operations"]);
  const events = store.snapshot().events.filter((e) => e.subjectId === ada.personId && e.via === "bulk").map((e) => e.action);
  assert.ok(events.includes("portal.role_changed") && events.includes("portal.voucher_removed") && events.includes("portal.admin_group_removed"));
});

test("portal access cannot be removed from yourself", () => {
  const store = createStore();
  const snap = store.snapshot();
  const me = snap.people.find((p) => p.id === snap.session.actorId);
  const r = store.bulk("removePortal", [`${me.id}--portal`]);
  assert.match(r.skipped[0].reason, /your own/);
});

// ---- drafts
test("import drafts are saved, replaced and discarded, and survive a reload", () => {
  const storage = { items: {}, getItem(k) { return this.items[k] ?? null; }, setItem(k, v) { this.items[k] = String(v); } };
  const store = createStore({ storage });
  store.saveImportDraft({ id: "d1", fileName: "a.csv", rows: importRows });
  store.saveImportDraft({ id: "d1", fileName: "a.csv", rows: importRows.slice(0, 1) });
  const reloaded = createStore({ storage });
  assert.equal(reloaded.snapshot().importDrafts.length, 1);
  assert.equal(reloaded.snapshot().importDrafts[0].rows.length, 1);
  reloaded.discardImportDraft("d1");
  assert.equal(reloaded.snapshot().importDrafts.length, 0);
  assert.throws(() => store.saveImportDraft({ id: "big", fileName: "x", rows: new Array(501).fill({}) }), /could not be saved/);
});

test("old databases without drafts or a Needs voucher status still load", () => {
  const old = seedDatabase();
  delete old.importDrafts;
  assert.deepEqual(normaliseDatabase(old).importDrafts, []);
});

// ---- permissions inside bulk actions
test("Viewers change no one; Limited Admins change only students in their voucher scope", () => {
  const store = createStore();
  const snap = store.snapshot();
  const viewer = snap.people.find((p) => p.portal?.role === "Viewer");
  const limited = snap.people.find((p) => p.portal?.role === "Limited Admin");
  const ids = students(store).filter((u) => u.status === "Active").map((u) => u.id);
  store.setActor(viewer.id);
  const asViewer = store.bulk("status", ids.slice(0, 3), { status: "Suspended" });
  assert.equal(asViewer.applied.length, 0);
  assert.ok(asViewer.skipped.every((s) => /do not have access/.test(s.reason)));
  store.setActor(limited.id);
  const inScope = (u) => limited.portal.voucherIds.includes(snap.people.find((p) => p.id === u.personId).student.voucherId);
  const r = store.bulk("team", ids, { team: "" });
  const inScopeCount = students(store).filter((u) => ids.includes(u.id) && inScope(u)).length;
  assert.equal(r.applied.length + r.unchanged.length, inScopeCount, "only in-scope students were touched");
  assert.ok(r.skipped.some((s) => /do not have access/.test(s.reason)), "out-of-scope students are skipped");
  const portal = store.bulk("role", [`${snap.people.find((p) => p.portal?.role === "Viewer").id}--portal`], { role: "Admin" });
  assert.match(portal.skipped[0].reason, /do not have access/, "Limited Admins cannot change portal access");
  assert.match(store.bulk("remove", [ids[0]]).skipped[0].reason, /do not have access/, "removing a person is Admin-only");
});

test("a student waiting for a voucher cannot be enrolled, and the profile does not offer training", () => {
  const store = createStore();
  store.commitCsvImport(importRows);
  const snap = store.snapshot();
  const held = snap.people.find((p) => p.student?.status === "Needs voucher");
  const admin = snap.people.find((p) => p.portal?.role === "Admin");
  assert.equal(personPermissions(held, admin).canManageTraining, false);
  const alerts = alertsFor(held, snap, admin).map((a) => a.key);
  assert.ok(alerts.includes("needs-voucher"));
  assert.equal(alertsFor(held, snap, admin).find((a) => a.key === "needs-voucher").action.type, "assign-voucher");
});

test("releasing the invitation clears the needs-voucher alert", () => {
  const store = createStore();
  store.commitCsvImport(importRows);
  const id = students(store).find((u) => u.status === "Needs voucher");
  store.bulk("voucher", [id.id], { voucher: V1 });
  const snap = store.snapshot();
  const admin = snap.people.find((p) => p.portal?.role === "Admin");
  assert.ok(!alertsFor(snap.people.find((p) => p.id === id.personId), snap, admin).some((a) => a.key === "needs-voucher"));
});

// ---- safety rules and the role-scoped remove
test("removing the student role keeps portal access; a student-only person is archived", () => {
  const store = createStore();
  const dual = store.view().users.find((u) => u.type === "student" && u.email === "tom.halloway@example.com");
  const only = students(store).find((u) => !store.getPerson(u.id).portal);
  const r = store.bulk("removeStudent", [dual.id, only.id]);
  assert.equal(r.applied.length, 2);
  const tom = store.snapshot().people.find((p) => p.id === dual.personId);
  assert.ok(!tom.student && tom.portal && !tom.archivedAt, "Tom is still an Admin");
  assert.ok(store.snapshot().people.find((p) => p.id === only.personId).archivedAt);
  const events = store.snapshot().events.filter((e) => e.batchId === r.batchId);
  assert.deepEqual([...new Set(events.map((e) => e.action))], ["student.removed"]);
});

test("you cannot suspend, demote or remove yourself in a bulk action", () => {
  const store = createStore();
  const snap = store.snapshot();
  const me = `${snap.session.actorId}--portal`;
  assert.match(store.bulk("status", [me], { status: "Suspended" }).skipped[0].reason, /suspend yourself/);
  assert.match(store.bulk("role", [me], { role: "Viewer" }).skipped[0].reason, /your own role/);
  assert.match(store.bulk("removePortal", [me]).skipped[0].reason, /your own/);
});

test("the organisation always keeps at least one active Admin", () => {
  const store = createStore();
  const admins = () => store.view().users.filter((u) => u.type === "portal" && ["Admin", "SSO Admin"].includes(u.role) && u.status === "Active");
  const me = store.snapshot().session.actorId;
  const others = admins().filter((u) => u.personId !== me);
  const results = others.map((u) => store.bulk("status", [u.id], { status: "Suspended" }));
  assert.equal(admins().length, 1, "only the signed-in Admin is left active");
  assert.equal(results.at(-1).applied.length + results.at(-1).skipped.length, 1);
  const lastOther = store.snapshot().people.find((p) => p.id === me);
  assert.ok(lastOther);
});

test("a Limited Admin can only put students on a voucher they manage", () => {
  const store = createStore();
  const snap = store.snapshot();
  const limited = snap.people.find((p) => p.portal?.role === "Limited Admin");
  store.setActor(limited.id);
  const own = snap.vouchers.find((v) => v.id === limited.portal.voucherIds[0]).name;
  const foreign = snap.vouchers.find((v) => !limited.portal.voucherIds.includes(v.id)).name;
  const mine = students(store).filter((u) => limited.portal.voucherIds.includes(store.snapshot().people.find((p) => p.id === u.personId).student.voucherId)).slice(0, 2).map((u) => u.id);
  const r = store.bulk("voucher", mine, { voucher: foreign });
  assert.equal(r.applied.length, 0);
  assert.ok(r.skipped.every((s) => /do not manage/.test(s.reason)));
  assert.equal(store.bulk("voucher", mine, { voucher: own }).skipped.length, 0);
});

test("resent invitations cannot be undone", () => {
  const store = createStore();
  const pending = students(store).filter((u) => u.status === "Pending invite").map((u) => u.id);
  assert.ok(pending.length >= 1);
  const r = store.bulk("resend", pending);
  assert.equal(r.applied.length, pending.length);
  assert.equal(r.undoId, undefined);
});

test("undo leaves alone anyone who has been changed again since", () => {
  const store = createStore();
  const ids = students(store).filter((u) => u.status === "Active").slice(0, 3).map((u) => u.id);
  const r = store.bulk("status", ids, { status: "Suspended" });
  store.changeStatus(ids[0], "Active");
  const out = store.undo(r.undoId);
  assert.equal(out.restored, 2);
  assert.deepEqual(out.skipped.map((s) => [s.id === undefined, s.reason]), [[false, "Changed since"]]);
  assert.equal(students(store).find((u) => u.id === ids[0]).status, "Active", "the later edit is kept");
  assert.equal(store.snapshot().events.filter((e) => e.action === "bulk.undone").length, 2);
});

test("import.completed records the invited, needs-voucher and excluded counts", () => {
  const store = createStore();
  const out = store.commitCsvImport(importRows, { fileName: "x.csv", excluded: 4 });
  const summary = store.snapshot().events.find((e) => e.batchId === out.batchId && e.action === "import.completed");
  const get = (field) => summary.changes.find((c) => c.field === field).to;
  assert.deepEqual([get("count"), get("invited"), get("needsVoucher"), get("excluded")], [3, 1, 2, 4]);
});

// ---- permanent delete
test("permanent delete removes the person and their data, and anonymises the activity log", () => {
  const store = createStore();
  const snap = store.snapshot();
  const target = snap.people.find((p) => p.student && !p.portal && snap.courseEnrolments.some((e) => e.personId === p.id) && snap.certifications.some((c) => c.personId === p.id));
  store.updatePersonDetails(target.id, { name: target.name, email: "renamed.person@example.com", workRole: target.workRole });
  const eventsBefore = store.snapshot().events.length;
  const r = store.bulk("deletePermanently", [`${target.id}--student`]);
  assert.equal(r.applied.length, 1);
  assert.equal(r.undoId, undefined, "cannot be undone");
  const after = store.snapshot();
  assert.ok(!after.people.some((p) => p.id === target.id));
  assert.ok(!after.courseEnrolments.some((e) => e.personId === target.id));
  assert.ok(!after.certifications.some((c) => c.personId === target.id));
  assert.equal(after.events.length, eventsBefore + 1, "no event is removed; one is added");
  assert.equal(after.events[0].action, "person.deleted");
  const everything = JSON.stringify(after);
  assert.ok(!everything.includes(target.name), "the name is gone everywhere");
  assert.ok(!everything.includes(target.email) && !everything.includes("renamed.person@example.com"), "the email is gone everywhere");
  assert.ok(after.events.some((e) => e.subjectName === "Deleted user" && String(e.subjectId).startsWith("deleted-")));
  assert.match(plainText(describeEvent(after.events[0])), /permanently deleted a person and their data/);
});

test("permanent delete protects you and the last active Admin, and handles both rows of a dual-role person once", () => {
  const store = createStore();
  const me = store.snapshot().session.actorId;
  assert.match(store.bulk("deletePermanently", [`${me}--portal`]).skipped[0].reason, /delete yourself/);
  const tom = store.view().users.filter((u) => u.email === "tom.halloway@example.com");
  const r = store.bulk("deletePermanently", tom.map((u) => u.id));
  assert.equal(r.applied.length, 1);
  assert.equal(r.skipped.length, 0);
  assert.ok(!store.snapshot().people.some((p) => p.email === "tom.halloway@example.com"));
});

test("permanent delete is Admin-only", () => {
  const store = createStore();
  const snap = store.snapshot();
  store.setActor(snap.people.find((p) => p.portal?.role === "Limited Admin").id);
  const target = students(store).find((u) => u.email !== "tom.halloway@example.com");
  assert.match(store.bulk("deletePermanently", [target.id]).skipped[0].reason, /do not have access/);
});
