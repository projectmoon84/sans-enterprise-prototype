import test from "node:test";
import assert from "node:assert/strict";
import { createStore, normaliseDatabase, seedDatabase } from "../src/store.js";
import { describeEvent } from "../src/activity.js";
import {
  COURSES,
  CURRENT_STATUSES,
  ENROLMENT_STATUSES,
  certificationStatus,
  currentEnrolments,
} from "../src/training.js";

const NOW = new Date("2026-10-16T10:00:00.000Z");

test("the seed has a catalogue and believable histories for most students", () => {
  const data = seedDatabase();
  assert.ok(data.courses.length >= 8);
  assert.ok(["SEC275", "SEC401", "SEC504", "SEC560", "FOR508", "LDR512", "ICS410"].every((code) => data.courses.some((c) => c.code === code)));
  const students = data.people.filter((p) => p.student);
  const withHistory = students.filter((p) => data.courseEnrolments.some((e) => e.personId === p.id));
  assert.ok(withHistory.length / students.length > 0.7);
  assert.ok(withHistory.length < students.length, "some students have no history yet");
});

test("seeded enrolments are consistent with the student's voucher and status rules", () => {
  const data = seedDatabase();
  for (const item of data.courseEnrolments) {
    assert.ok(ENROLMENT_STATUSES.includes(item.status));
    assert.equal(item.voucherId, data.people.find((p) => p.id === item.personId).student.voucherId);
    if (item.status === "completed") {
      assert.equal(item.progress, 100);
      assert.ok(item.score > 0 && item.completedAt);
    }
    if (item.status === "in_progress") assert.ok(item.startedAt && item.endsAt && item.progress < 100);
  }
});

test("seed includes valid, expiring-soon and expired certifications", () => {
  const data = seedDatabase();
  const keys = new Set(data.certifications.map((c) => certificationStatus(c, NOW).key));
  assert.deepEqual([...keys].sort(), ["expired", "expiring", "valid"]);
});

test("certification status uses the 60 day warning window", () => {
  const cert = (days) => ({ expiresAt: new Date(NOW.getTime() + days * 86400000).toISOString() });
  assert.equal(certificationStatus(cert(61), NOW).key, "valid");
  assert.equal(certificationStatus(cert(60), NOW).key, "expiring");
  assert.equal(certificationStatus(cert(-1), NOW).key, "expired");
});

test("seed writes training events from SANS and from admins", () => {
  const data = seedDatabase();
  const actions = new Set(data.events.map((e) => e.action));
  for (const action of ["training.completed", "certification.earned", "training.assigned", "training.requested", "training.withdrawn"])
    assert.ok(actions.has(action), action);
  assert.ok(data.events.filter((e) => e.action === "training.completed").every((e) => e.actorId === "sans"));
});

test("assigning a course funds it from the student's voucher and logs an event", () => {
  const store = createStore();
  const snap = store.snapshot();
  const student = snap.people.find((p) => p.student && !snap.courseEnrolments.some((e) => e.personId === p.id));
  const course = snap.courses.find((c) => c.code === "ICS410");
  const id = store.assignCourse(student.id, { courseId: course.id });
  const after = store.snapshot();
  const enrolment = after.courseEnrolments.find((e) => e.id === id);
  assert.equal(enrolment.status, "in_progress");
  assert.equal(enrolment.voucherId, student.student.voucherId);
  assert.equal(enrolment.progress, 0);
  const event = after.events[0];
  assert.equal(event.action, "training.assigned");
  assert.equal(event.subjectId, student.id);
  assert.match(describeEvent(event), /enrolled .* on ICS410/);
});

test("the same course cannot be assigned twice while current, but can be retaken after withdrawing", () => {
  const store = createStore();
  const student = store.snapshot().people.find((p) => p.student);
  const course = store.snapshot().courses.find((c) => c.code === "ICS410");
  const id = store.assignCourse(student.id, { courseId: course.id });
  assert.throws(() => store.assignCourse(student.id, { courseId: course.id }), /already on ICS410/);
  store.withdrawFromCourse(student.id, id);
  assert.doesNotThrow(() => store.assignCourse(student.id, { courseId: course.id }));
});

test("only students can be enrolled, and unknown courses are rejected", () => {
  const store = createStore();
  const snap = store.snapshot();
  const portalOnly = snap.people.find((p) => p.portal && !p.student);
  assert.throws(() => store.assignCourse(portalOnly.id, { courseId: snap.courses[0].id }), /Only students/);
  const student = snap.people.find((p) => p.student && p.student.status !== "Suspended");
  assert.throws(() => store.assignCourse(student.id, { courseId: "nope" }), /Choose a course/);
});

test("withdrawing updates the current list and logs training.withdrawn", () => {
  const store = createStore();
  const snap = store.snapshot();
  const enrolment = snap.courseEnrolments.find((e) => e.status === "in_progress");
  const before = currentEnrolments(snap, enrolment.personId).length;
  store.withdrawFromCourse(enrolment.personId, enrolment.id);
  const after = store.snapshot();
  assert.equal(currentEnrolments(after, enrolment.personId).length, before - 1);
  assert.equal(after.events[0].action, "training.withdrawn");
  assert.match(describeEvent(after.events[0]), /withdrew .* from /);
  assert.throws(() => store.withdrawFromCourse(enrolment.personId, enrolment.id), /Only current courses/);
});

test("completed courses cannot be withdrawn", () => {
  const store = createStore();
  const done = store.snapshot().courseEnrolments.find((e) => e.status === "completed");
  assert.throws(() => store.withdrawFromCourse(done.personId, done.id), /Only current courses/);
});

test("a v3 database saved before training existed gets training data on load", () => {
  const old = seedDatabase();
  delete old.courses;
  delete old.courseEnrolments;
  delete old.certifications;
  old.events = old.events.filter((e) => !e.action.startsWith("training.") && !e.action.startsWith("certification."));
  const data = normaliseDatabase(old);
  assert.ok(data.courses.length && data.courseEnrolments.length && data.certifications.length);
  assert.ok(data.events.some((e) => e.action === "training.completed"));
});

test("training records survive archiving the person, and bad references are rejected", () => {
  const store = createStore();
  const snap = store.snapshot();
  const enrolment = snap.courseEnrolments.find((e) => e.status === "completed");
  store.archivePerson(`${enrolment.personId}--student`);
  assert.ok(store.snapshot().courseEnrolments.some((e) => e.id === enrolment.id));
  const broken = store.snapshot();
  broken.courseEnrolments[0].courseId = "missing";
  assert.throws(() => normaliseDatabase(broken), /invalid training/);
});

test("catalogue constants are coherent", () => {
  assert.equal(new Set(COURSES.map((c) => c.id)).size, COURSES.length);
  assert.ok(CURRENT_STATUSES.every((s) => ENROLMENT_STATUSES.includes(s)));
});
