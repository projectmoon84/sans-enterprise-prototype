import test from "node:test";
import assert from "node:assert/strict";
import { createStore, seedDatabase } from "../src/store.js";
import {
  ACTION_CATEGORIES,
  actionCategory,
  batchHeadline,
  eventsToCsv,
  filterEvents,
  groupBatches,
  plainText,
  visibleEvents,
} from "../src/activity.js";

const evt = (id, extra = {}) => ({
  id,
  at: "2026-10-10T09:00:00.000Z",
  actorId: "a",
  actorName: "Ada",
  subjectId: "s",
  subjectName: "Sam",
  action: "person.details_updated",
  ...extra,
});

test("actions fall into categories, with a fallback", () => {
  assert.equal(actionCategory("portal.invited"), "portal");
  assert.equal(actionCategory("student.team_added"), "student");
  assert.equal(actionCategory("certification.earned"), "training");
  assert.equal(actionCategory("import.completed"), "import");
  assert.equal(actionCategory("legacy.note"), "other");
  assert.ok(ACTION_CATEGORIES.every((c) => c.label));
});

test("filters combine: person, category and an inclusive date range", () => {
  const data = seedDatabase();
  const events = [
    evt("1", { at: "2026-10-01T08:00:00.000Z", action: "portal.invited" }),
    evt("2", { at: "2026-10-05T23:30:00.000Z", action: "student.invited", actorId: "b", subjectId: "t" }),
    evt("3", { at: "2026-10-09T10:00:00.000Z", action: "student.invited" }),
  ];
  const ids = (f) => filterEvents(events, data, f).map((e) => e.id);
  assert.deepEqual(ids({ personId: "t" }), ["2"]);
  assert.deepEqual(ids({ personId: "a" }), ["1", "3"]);
  assert.deepEqual(ids({ category: "student" }), ["2", "3"]);
  assert.deepEqual(ids({ from: "2026-10-05", to: "2026-10-09" }), ["2", "3"]);
  assert.deepEqual(ids({ category: "student", personId: "a", from: "2026-10-09" }), ["3"]);
  assert.deepEqual(ids({}), ["1", "2", "3"]);
});

test("voucher and admin group filters use the subject's current records or the event target", () => {
  const data = seedDatabase();
  const student = data.people.find((p) => p.student && p.student.adminGroupId && !p.portal);
  const other = data.vouchers.find((v) => v.id !== student.student.voucherId);
  const events = [
    evt("in", { subjectId: student.id }),
    evt("target", { subjectId: "nobody", target: { type: "voucher", id: other.id, name: other.name } }),
  ];
  const ids = (f) => filterEvents(events, data, f).map((e) => e.id);
  assert.deepEqual(ids({ voucherId: student.student.voucherId }), ["in"]);
  assert.deepEqual(ids({ voucherId: other.id }), ["target"]);
  assert.deepEqual(ids({ adminGroupId: student.student.adminGroupId }), ["in"]);
});

test("Admins see every event; Limited Admins and Viewers see their voucher scope and their own actions", () => {
  const data = seedDatabase();
  const admin = data.people.find((p) => p.portal?.role === "Admin");
  const limited = data.people.find((p) => p.portal?.role === "Limited Admin");
  assert.equal(visibleEvents(data.events, data, admin).length, data.events.length);
  const seen = visibleEvents(data.events, data, limited);
  assert.ok(seen.length > 0 && seen.length < data.events.length);
  const mine = new Set(limited.portal.voucherIds);
  for (const event of seen) {
    const subject = data.people.find((p) => p.id === event.subjectId);
    const inScope = [subject?.student?.voucherId, ...(subject?.portal?.voucherIds || [])].some((id) => mine.has(id));
    assert.ok(event.actorId === limited.id || inScope, event.id);
  }
  assert.deepEqual(visibleEvents(data.events, data, undefined), []);
});

test("events with a shared batchId become one entry at the newest member; a batch of one stays plain", () => {
  const events = [
    evt("a", { batchId: "b1", action: "student.suspended" }),
    evt("x"),
    evt("b", { batchId: "b1", subjectId: "t", action: "student.suspended" }),
    evt("c", { batchId: "solo" }),
  ];
  const entries = groupBatches(events);
  assert.deepEqual(entries.map((e) => e.type), ["batch", "event", "event"]);
  assert.deepEqual(entries[0].events.map((e) => e.id), ["a", "b"]);
  assert.equal(entries[2].event.id, "c");
});

test("batch headlines read naturally for bulk actions and imports", () => {
  const suspend = { batchId: "b", events: [evt("a", { action: "student.suspended" }), evt("b", { subjectId: "t", action: "student.suspended" })] };
  assert.match(plainText(batchHeadline(suspend)), /^Ada suspended 2 people$/);
  const resend = { batchId: "b", events: [evt("a", { action: "portal.invite_resent" }), evt("b", { subjectId: "t", action: "portal.invite_resent" })] };
  assert.match(plainText(batchHeadline(resend)), /resent invitations to 2 people/);
  const csv = { batchId: "b", events: [evt("a", { action: "student.invited" }), evt("i", { action: "import.completed", subjectId: undefined, changes: [{ field: "count", from: 0, to: 3 }, { field: "file", from: null, to: "x.csv" }] })] };
  assert.match(plainText(batchHeadline(csv)), /imported 3 students from x\.csv/);
});

test("the seed's CSV import is one batch and nobody imports themselves", () => {
  const data = seedDatabase();
  const batch = groupBatches(data.events).find((e) => e.type === "batch" && e.batchId === "seed-csv-october");
  assert.ok(batch && batch.events.length === 4);
  assert.ok(batch.events.every((e) => e.actorId !== e.subjectId));
});

test("CSV export covers every column, escapes quotes and blocks spreadsheet formulas", () => {
  const events = [
    evt("1", { subjectName: '=HYPERLINK("http://evil")', actorName: 'Ada "Boss"', changes: [{ field: "team", from: null, to: "GRC, Audit" }], via: "profile", batchId: "b" }),
  ];
  const [header, row] = eventsToCsv(events).split("\n");
  assert.equal(header.split(",").length, 9);
  assert.ok(row.includes(`"'=HYPERLINK(""http://evil"")"`));
  assert.ok(row.includes('"Ada ""Boss"""'));
  assert.ok(row.includes('"team: not set -> GRC, Audit"'));
  assert.ok(row.includes('"b"'));
  assert.doesNotMatch(row, /<button|&amp;/);
});

test("plainText strips markup and decodes the entities describeEvent escapes", () => {
  assert.equal(plainText('<button class="x">R&amp;D &lt;b&gt;</button> &#39;ok&#39;'), "R&D <b> 'ok'");
});

test("'Last modified by' comes from the newest edit event, not mock text", () => {
  const store = createStore();
  const actor = store.snapshot().people.find((p) => p.id === store.snapshot().session.actorId);
  const person = store.snapshot().people.find((p) => p.student && p.id !== actor.id);
  store.updatePersonDetails(person.id, { name: `${person.name} Jr`, email: person.email, workRole: person.workRole });
  const row = store.view().users.find((u) => u.personId === person.id);
  assert.equal(row.lastModifiedBy, actor.name);
  assert.equal(row.lastModifiedRole, actor.portal.role);
  assert.ok(Date.now() - Date.parse(row.lastModifiedAt) < 60000);
  assert.equal(row.updatedAt, row.lastModifiedAt);
});

test("SANS training events do not count as the record being modified", () => {
  const store = createStore();
  const snap = store.snapshot();
  const completed = snap.events.find((e) => e.action === "training.completed");
  const rows = store.view().users.filter((u) => u.personId === completed.subjectId);
  assert.ok(rows.every((u) => u.lastModifiedBy !== "SANS"));
});
