import test from "node:test";
import assert from "node:assert/strict";
import { createStore, seedDatabase } from "../src/store.js";
import { alertsFor, alertCounts, personPermissions } from "../src/alerts.js";
import { describeEvent } from "../src/activity.js";

const NOW = new Date("2026-10-16T10:00:00.000Z");
const DAY = 86400000;
const ago = (days) => new Date(NOW.getTime() - days * DAY).toISOString();
const admin = (data) => data.people.find((p) => p.portal?.role === "Admin");
const viewerOf = (data) => data.people.find((p) => p.portal?.role === "Viewer");
const keys = (person, data, viewer, options) =>
  alertsFor(person, data, viewer, { now: NOW, ...options }).map((a) => a.key);
const student = (data) =>
  data.people.find(
    (p) => p.student && !data.courseEnrolments.some((e) => e.personId === p.id) && p.student.status === "Active",
  );

test("training request awaiting approval: Review for people who can approve, none for Viewers", () => {
  const data = seedDatabase();
  const request = data.courseEnrolments.find((e) => e.status === "requested");
  const person = data.people.find((p) => p.id === request.personId);
  const [alert] = alertsFor(person, data, admin(data), { now: NOW }).filter((a) => a.key === "training-request");
  assert.equal(alert.severity, "action");
  assert.equal(alert.action.type, "review-request");
  assert.equal(alert.action.enrolmentId, request.id);
  const [seen] = alertsFor(person, data, viewerOf(data), { now: NOW }).filter((a) => a.key === "training-request");
  assert.ok(seen, "viewers still see the alert");
  assert.equal(seen.action, undefined);
});

test("pending invitations alert after more than 5 days, not at exactly 5", () => {
  const data = seedDatabase();
  const person = data.people.find((p) => p.student && p.student.status === "Pending invite");
  person.student.invitedAt = ago(5);
  assert.ok(!keys(person, data, admin(data)).includes("invite-pending"));
  person.student.invitedAt = ago(6);
  const alert = alertsFor(person, data, admin(data), { now: NOW }).find((a) => a.key === "invite-pending");
  assert.equal(alert.severity, "warning");
  assert.match(alert.title, /Student invitation pending for 6 days/);
  assert.equal(alert.action.type, "resend");
  assert.equal(alert.action.rowId, `${person.id}--student`);
});

test("portal invitations can only be resent by Admins", () => {
  const data = seedDatabase();
  const person = data.people.find((p) => p.portal && !p.student && p.portal.status === "Pending invite");
  person.portal.invitedAt = ago(8);
  const limited = data.people.find((p) => p.portal?.role === "Limited Admin");
  const alert = (viewer) => alertsFor(person, data, viewer, { now: NOW }).find((a) => a.key === "invite-pending");
  assert.equal(alert(admin(data)).action.type, "resend");
  assert.equal(alert(limited).action, undefined);
});

test("awaiting a SANS account alerts after more than 7 days, and defers to a pending-invite alert", () => {
  const data = seedDatabase();
  const person = data.people.find((p) => p.student && p.student.status === "Active");
  person.sansAccount = "awaiting";
  person.student.invitedAt = ago(7);
  assert.ok(!keys(person, data, admin(data)).includes("awaiting-account"));
  person.student.invitedAt = ago(8);
  const alert = alertsFor(person, data, admin(data), { now: NOW }).find((a) => a.key === "awaiting-account");
  assert.match(alert.title, /Awaiting SANS account for 8 days/);
  person.student.status = "Pending invite";
  const found = keys(person, data, admin(data));
  assert.ok(found.includes("invite-pending") && !found.includes("awaiting-account"));
});

test("certification alerts: expiring within 60 days is a warning, expired is an error", () => {
  const data = seedDatabase();
  const person = student(data) || data.people.find((p) => p.student);
  data.certifications.push(
    { id: "c1", personId: person.id, code: "GSEC", name: "GIAC Security Essentials", issuedAt: ago(1400), expiresAt: new Date(NOW.getTime() + 28 * DAY).toISOString() },
    { id: "c2", personId: person.id, code: "GCIH", name: "GIAC Certified Incident Handler", issuedAt: ago(1500), expiresAt: ago(10) },
    { id: "c3", personId: person.id, code: "GPEN", name: "GIAC Penetration Tester", issuedAt: ago(10), expiresAt: new Date(NOW.getTime() + 61 * DAY).toISOString() },
  );
  const alerts = alertsFor(person, data, admin(data), { now: NOW }).filter((a) => a.key.startsWith("cert-"));
  assert.deepEqual(alerts.map((a) => [a.key, a.severity]), [["cert-expired", "error"], ["cert-expiring", "warning"]]);
  assert.match(alerts[1].title, /GSEC certification expires in 28 days/);
  assert.equal(alerts[0].action.type, "view-training");
});

test("an expired certification replaced by a newer valid one does not alert", () => {
  const data = seedDatabase();
  const person = data.people.find((p) => p.student);
  data.certifications = data.certifications.filter((c) => c.personId !== person.id);
  data.certifications.push(
    { id: "old", personId: person.id, code: "GSEC", name: "x", issuedAt: ago(1600), expiresAt: ago(100) },
    { id: "new", personId: person.id, code: "GSEC", name: "x", issuedAt: ago(30), expiresAt: new Date(NOW.getTime() + 1400 * DAY).toISOString() },
  );
  assert.ok(!keys(person, data, admin(data)).some((k) => k.startsWith("cert-")));
});

test("a course past its end date but not completed warns", () => {
  const data = seedDatabase();
  const item = data.courseEnrolments.find((e) => e.status === "in_progress");
  const person = data.people.find((p) => p.id === item.personId);
  item.endsAt = ago(3);
  const alert = alertsFor(person, data, admin(data), { now: NOW }).find((a) => a.key === "course-overdue");
  assert.equal(alert.severity, "warning");
  item.endsAt = new Date(NOW.getTime() + 3 * DAY).toISOString();
  assert.ok(!keys(person, data, admin(data)).includes("course-overdue"));
});

test("suspended roles are info alerts with Reactivate only where permitted", () => {
  const data = seedDatabase();
  const person = data.people.find((p) => p.student);
  person.student.status = "Suspended";
  const limited = data.people.find((p) => p.portal?.role === "Limited Admin");
  const alert = (viewer) => alertsFor(person, data, viewer, { now: NOW }).find((a) => a.key === "suspended");
  assert.equal(alert(admin(data)).severity, "info");
  assert.equal(alert(admin(data)).action.type, "reactivate");
  assert.equal(alert(viewerOf(data)).action, undefined);
  const inScope = limited.portal.voucherIds.includes(person.student.voucherId);
  assert.equal(Boolean(alert(limited).action), inScope && (!person.student.adminGroupId || limited.portal.adminGroupIds.includes(person.student.adminGroupId)));
});

test("'no team' is off by default and opt-in", () => {
  const data = seedDatabase();
  const person = data.people.find((p) => p.student);
  delete person.student.teamId;
  assert.ok(!keys(person, data, admin(data)).includes("no-team"));
  assert.ok(keys(person, data, admin(data), { noTeam: true }).includes("no-team"));
});

test("alerts are sorted error, action needed, warning, info", () => {
  const data = seedDatabase();
  const person = data.people.find((p) => p.student);
  person.student.status = "Suspended";
  data.courseEnrolments.push({ id: "r", personId: person.id, courseId: data.courses[0].id, status: "requested", voucherId: person.student.voucherId, requestedAt: ago(1), progress: 0 });
  data.certifications.push(
    { id: "x", personId: person.id, code: "GCIH", name: "n", issuedAt: ago(1500), expiresAt: ago(5) },
    { id: "y", personId: person.id, code: "GSEC", name: "n", issuedAt: ago(1400), expiresAt: new Date(NOW.getTime() + 10 * DAY).toISOString() },
  );
  const order = alertsFor(person, data, admin(data), { now: NOW }).map((a) => a.severity);
  assert.deepEqual(order, [...order].sort((a, b) => ["error", "action", "warning", "info"].indexOf(a) - ["error", "action", "warning", "info"].indexOf(b)));
  assert.equal(order[0], "error");
  assert.equal(order.at(-1), "info");
});

test("archived people have no alerts, and counts cover people with alerts only", () => {
  const data = seedDatabase();
  const counts = alertCounts(data, admin(data), { now: NOW });
  assert.ok(counts.size > 0 && counts.size < data.people.length);
  const [id] = counts.keys();
  data.people.find((p) => p.id === id).archivedAt = NOW.toISOString();
  assert.deepEqual(alertsFor(data.people.find((p) => p.id === id), data, admin(data), { now: NOW }), []);
});

test("the seed shows every main alert kind somewhere", () => {
  const data = seedDatabase();
  const kinds = new Set();
  for (const person of data.people) for (const alert of alertsFor(person, data, admin(data), { now: NOW })) kinds.add(alert.key);
  for (const kind of ["training-request", "invite-pending", "cert-expiring", "cert-expired", "course-overdue"]) assert.ok(kinds.has(kind), kind);
});

test("permissions follow the viewer's role and scope", () => {
  const data = seedDatabase();
  const person = data.people.find((p) => p.student);
  assert.equal(personPermissions(person, admin(data)).canEditPortal, true);
  assert.deepEqual(Object.values(personPermissions(person, viewerOf(data))).filter(Boolean), []);
});

// ---- acting on alerts clears them and logs the action
const requested = (store) => {
  const snap = store.snapshot();
  const item = snap.courseEnrolments.find((e) => e.status === "requested");
  return { snap, item, person: snap.people.find((p) => p.id === item.personId) };
};
const hasRequestAlert = (store, person) => {
  const snap = store.snapshot();
  const actor = snap.people.find((p) => p.id === snap.session.actorId);
  return alertsFor(snap.people.find((p) => p.id === person.id), snap, actor, { now: NOW }).some((a) => a.key === "training-request");
};

test("approving a request clears the alert and logs training.approved", () => {
  const store = createStore();
  const { item, person } = requested(store);
  assert.ok(hasRequestAlert(store, person));
  store.approveTrainingRequest(person.id, item.id);
  assert.ok(!hasRequestAlert(store, person));
  const snap = store.snapshot();
  assert.equal(snap.courseEnrolments.find((e) => e.id === item.id).status, "approved");
  assert.equal(snap.events[0].action, "training.approved");
  assert.match(describeEvent(snap.events[0]), /approved .* request for /);
});

test("declining a request clears the alert and logs training.declined", () => {
  const store = createStore();
  const { item, person } = requested(store);
  store.declineTrainingRequest(person.id, item.id);
  assert.ok(!hasRequestAlert(store, person));
  assert.equal(store.snapshot().courseEnrolments.find((e) => e.id === item.id).status, "withdrawn");
  assert.equal(store.snapshot().events[0].action, "training.declined");
  assert.throws(() => store.approveTrainingRequest(person.id, item.id), /already been dealt with/);
});

test("resending an invitation resets its age so the alert clears", () => {
  const store = createStore();
  const data = store.snapshot();
  const row = store.view().users.find((u) => {
    const person = data.people.find((p) => p.id === u.personId);
    return u.status === "Pending invite" && person[u.type].invitedAt < ago(5);
  });
  assert.ok(row, "seed has an overdue invitation");
  const actor = (snap) => snap.people.find((p) => p.id === snap.session.actorId);
  const overdue = (snap) => alertsFor(snap.people.find((p) => p.id === row.personId), snap, actor(snap)).some((a) => a.key === "invite-pending" && a.action?.rowId === row.id);
  assert.ok(overdue(store.snapshot()));
  store.resendInvite(row.id);
  assert.ok(!overdue(store.snapshot()));
  assert.match(store.snapshot().events[0].action, /invite_resent/);
});

test("reactivating clears a suspended alert", () => {
  const store = createStore();
  const row = store.view().users.find((u) => u.type === "student");
  store.changeStatus(row.id, "Suspended");
  const snap = store.snapshot();
  const person = snap.people.find((p) => p.id === row.personId);
  const actor = snap.people.find((p) => p.id === snap.session.actorId);
  assert.ok(alertsFor(person, snap, actor, { now: NOW }).some((a) => a.key === "suspended"));
  store.changeStatus(row.id, "Active");
  const after = store.snapshot();
  assert.ok(!alertsFor(after.people.find((p) => p.id === row.personId), after, actor, { now: NOW }).some((a) => a.key === "suspended"));
});
