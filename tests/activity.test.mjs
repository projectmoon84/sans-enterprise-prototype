import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../src/store.js";
import {
  describeEvent,
  eventsFor,
  dayLabel,
  groupEventsByDay,
  batchSummary,
  viaLabel,
  describeChange,
} from "../src/activity.js";

const newStudent = (email = "event.student@example.com") => ({
  name: "Event Student",
  email,
  voucher: "Cyber Defense FY26",
  group: "Federal Division",
  team: "Security Operations",
  workRole: "Analyst",
});

const portalInput = (row, changes = {}) => ({
  name: row.name,
  email: row.email,
  role: row.role,
  vouchers: row.vouchers,
  groups: row.groups,
  teams: row.teams,
  status: row.status,
  ...changes,
});

const studentInput = (row, changes = {}) => ({
  name: row.name,
  email: row.email,
  voucher: row.vouchers[0],
  group: row.groups[0] || "",
  team: row.teams[0] || "",
  workRole: row.workRole,
  status: row.status,
  ...changes,
});

test("seed includes a signed-in actor and realistic structured history", () => {
  const data = createStore().snapshot();
  const actor = data.people.find(
    (person) => person.id === data.session.actorId,
  );
  assert.equal(actor.name, "Ada Whitfield");
  assert.ok(data.events.length >= 60);
  assert.ok(data.events.some((event) => event.batchId && event.via === "csv"));
  assert.ok(data.events.every((event) => event.actorName && event.action));
});

test("activity descriptions use catalogue wording and profile links", () => {
  const store = createStore();
  const before = store.snapshot().events.length;
  store.addStudent(newStudent());
  const event = store.snapshot().events[0];
  assert.equal(store.snapshot().events.length, before + 1);
  assert.match(
    describeEvent(event),
    /added .*Event Student.* as a student on Cyber Defense FY26/,
  );
  assert.match(describeEvent(event), /data-action="open-event-person"/);
  assert.deepEqual(
    eventsFor(store.snapshot().events, event.subjectId, {
      to: true,
      by: false,
    })[0],
    event,
  );
});

test("detail events describe first-time and cleared values naturally", () => {
  const base = {
    actorId: "actor",
    actorName: "Ada Whitfield",
    subjectId: "subject",
    subjectName: "Marcus Okonjo",
    action: "person.details_updated",
  };
  assert.match(
    describeEvent({
      ...base,
      changes: [{ field: "workRole", from: "", to: "Security Director" }],
    }),
    /set .* work role to Security Director/,
  );
  assert.match(
    describeEvent({
      ...base,
      changes: [{ field: "workRole", from: "Analyst", to: "" }],
    }),
    /cleared .* work role/,
  );
});

test("every user-facing store command writes an event", () => {
  const cases = [
    (store) => {
      const person = store.snapshot().people.find((p) => p.student && p.student.status !== "Suspended");
      const course = store.snapshot().courses.find(
        (c) => !store.snapshot().courseEnrolments.some((e) => e.personId === person.id && e.courseId === c.id),
      );
      store.assignCourse(person.id, { courseId: course.id });
    },
    (store) => {
      const enrolment = store.snapshot().courseEnrolments.find((e) => e.status === "in_progress");
      store.withdrawFromCourse(enrolment.personId, enrolment.id);
    },
    (store) =>
      store.invitePortalUser({
        name: "New Admin",
        email: "new.admin@example.com",
        role: "Viewer",
        vouchers: ["Cyber Defense FY26"],
        groups: ["Federal Division"],
        teams: [],
      }),
    (store) => store.addStudent(newStudent()),
    (store) =>
      store.addStudents([
        newStudent("one.student@example.com"),
        newStudent("two.student@example.com"),
      ]),
    (store) => {
      const row = store.view().users.find((user) => user.type === "portal");
      store.editPortalAccess(row.id, portalInput(row, { role: "Viewer" }));
    },
    (store) => {
      const row = store.view().users.find((user) => user.type === "student");
      store.editStudentDetails(
        row.id,
        studentInput(row, {
          team:
            row.teams[0] === "Cloud Platform"
              ? "GRC & Audit"
              : "Cloud Platform",
        }),
      );
    },
    (store) => {
      const row = store.view().users.find((user) => user.type === "student");
      store.changeStatus(row.id, "Suspended");
    },
    (store) => {
      const row = store
        .view()
        .users.find(
          (user) => user.type === "portal" && user.status === "Pending invite",
        );
      store.resendInvite(row.id);
    },
    (store) => {
      const rows = store
        .view()
        .users.filter((user) => user.type === "student")
        .slice(0, 2);
      store.bulkStatus(
        rows.map((row) => row.id),
        "Suspended",
      );
    },
    (store) => {
      const rows = store
        .view()
        .users.filter((user) => user.status === "Pending invite");
      store.bulkResend(rows.map((row) => row.id));
    },
    (store) => {
      const row = store
        .view()
        .users.find(
          (user) =>
            user.type === "student" &&
            user.email !== "ada.whitfield@example.com",
        );
      store.archivePerson(row.id);
    },
    (store) => {
      const rows = store
        .view()
        .users.filter(
          (user) =>
            user.type === "student" &&
            user.email !== "ada.whitfield@example.com",
        )
        .slice(0, 2);
      store.archivePeople(rows.map((row) => row.id));
    },
    (store) => store.createTeam("Incident Coordination"),
    (store) => store.commitCsvImport([newStudent("csv.student@example.com")]),
  ];
  for (const run of cases) {
    const store = createStore();
    const before = store.snapshot().events.length;
    run(store);
    assert.ok(store.snapshot().events.length > before);
  }
});

test("bulk and CSV events share batch ids", () => {
  const store = createStore();
  const rows = store
    .view()
    .users.filter((user) => user.type === "student")
    .slice(0, 3);
  let before = store.snapshot().events.length;
  store.bulkStatus(
    rows.map((row) => row.id),
    "Suspended",
  );
  const bulk = store
    .snapshot()
    .events.slice(0, store.snapshot().events.length - before);
  assert.equal(new Set(bulk.map((event) => event.batchId)).size, 1);
  assert.ok(bulk.every((event) => event.via === "bulk"));

  before = store.snapshot().events.length;
  store.commitCsvImport([
    newStudent("csv.one@example.com"),
    newStudent("csv.two@example.com"),
  ]);
  const csv = store
    .snapshot()
    .events.slice(0, store.snapshot().events.length - before);
  assert.equal(new Set(csv.map((event) => event.batchId)).size, 1);
  assert.ok(csv.every((event) => event.via === "csv"));
  assert.ok(csv.some((event) => event.action === "import.completed"));
});

test("events retain snapshots after their subject is archived", () => {
  const store = createStore();
  const id = store.addStudent(newStudent());
  store.archivePerson(`${id}--student`);
  const events = eventsFor(store.snapshot().events, id);
  assert.ok(events.some((event) => event.action === "student.invited"));
  assert.ok(events.some((event) => event.action === "person.archived"));
  assert.ok(events.every((event) => event.subjectName === "Event Student"));
});

test("switching actor attributes the next command to that portal user", () => {
  const store = createStore();
  const actor = store
    .snapshot()
    .people.find((person) => person.portal && person.name === "Priya Raman");
  store.setActor(actor.id);
  store.addStudent(newStudent());
  const event = store.snapshot().events[0];
  assert.equal(event.actorId, actor.id);
  assert.equal(event.actorName, "Priya Raman");
});

const evt = (id, actorId, subjectId, extra = {}) => ({
  id,
  at: "2026-10-16T09:00:00.000Z",
  actorId,
  actorName: actorId,
  subjectId,
  subjectName: subjectId,
  action: "person.details_updated",
  ...extra,
});

test("eventsFor filters done-to, done-by and both, showing each event once", () => {
  const events = [
    evt("a", "ada", "bob"),
    evt("b", "bob", "ada"),
    evt("c", "ada", "ada"),
    evt("d", "bob", "cy"),
  ];
  const ids = (options) => eventsFor(events, "ada", options).map((e) => e.id);
  assert.deepEqual(ids({ to: true, by: false }), ["b", "c"]);
  assert.deepEqual(ids({ to: false, by: true }), ["a", "c"]);
  assert.deepEqual(ids({ to: true, by: true }), ["a", "b", "c"]);
  assert.deepEqual(ids({ to: false, by: false }), []);
});

test("changes made on someone else's profile show under done by the signed-in actor", () => {
  const store = createStore();
  const snap = store.snapshot();
  const ada = snap.people.find((p) => p.email === "ada.whitfield@example.com");
  const other = snap.people.find((p) => p.id !== ada.id && p.student);
  store.setActor(ada.id);
  const before = eventsFor(store.snapshot().events, ada.id, { to: false, by: true }).length;
  store.updatePersonDetails(other.id, { name: `${other.name} Jr`, email: other.email, workRole: other.workRole });
  const after = eventsFor(store.snapshot().events, ada.id, { to: false, by: true });
  assert.equal(after.length, before + 1);
  assert.equal(eventsFor(store.snapshot().events, ada.id, { to: true, by: false }).some((e) => e.id === after[0].id), false);
});

test("day labels read Today, Yesterday, then a full date", () => {
  const now = new Date(2026, 9, 16, 12, 0);
  assert.equal(dayLabel(new Date(2026, 9, 16, 0, 5).toISOString(), now), "Today");
  assert.equal(dayLabel(new Date(2026, 9, 15, 23, 55).toISOString(), now), "Yesterday");
  assert.equal(dayLabel(new Date(2026, 9, 14, 10, 0).toISOString(), now), "14 Oct 2026");
});

test("events group by day in the order given", () => {
  const now = new Date(2026, 9, 16, 12, 0);
  const events = [
    evt("a", "x", "y", { at: new Date(2026, 9, 16, 9).toISOString() }),
    evt("b", "x", "y", { at: new Date(2026, 9, 16, 8).toISOString() }),
    evt("c", "x", "y", { at: new Date(2026, 9, 15, 9).toISOString() }),
  ];
  const groups = groupEventsByDay(events, now);
  assert.deepEqual(groups.map((g) => [g.label, g.events.length]), [["Today", 2], ["Yesterday", 1]]);
});

test("batch summary counts the people in a shared batch", () => {
  const events = [
    evt("a", "x", "p1", { via: "csv", batchId: "b1" }),
    evt("b", "x", "p2", { via: "csv", batchId: "b1" }),
    evt("c", "x", "p3", { via: "bulk" }),
    evt("d", "x", "p4", { via: "profile" }),
  ];
  assert.equal(batchSummary(events, events[0]), "Part of CSV import (2 people)");
  assert.equal(batchSummary(events, events[2]), "Part of a bulk action");
  assert.equal(batchSummary(events, events[3]), "");
  assert.equal(viaLabel(events[0]), "CSV import");
  assert.equal(viaLabel(events[3]), "");
});

test("change values are escaped and empty values read Not set", () => {
  assert.deepEqual(describeChange({ field: "team", from: null, to: "<b>R&D</b>" }), {
    field: "Team",
    from: "Not set",
    to: "&lt;b&gt;R&amp;D&lt;/b&gt;",
  });
  assert.equal(describeChange({ field: "workRole", from: "A", to: "B" }).field, "Work role");
});

test("a portal-only person's empty work role stays empty and is not logged as a change", () => {
  const store = createStore();
  const person = store.snapshot().people.find((p) => p.portal && !p.student && !p.workRole);
  assert.ok(person, "seed has a portal-only person without a work role");
  const before = store.snapshot().events.length;
  store.updatePersonDetails(person.id, { name: `${person.name} Jr`, email: person.email, workRole: "" });
  const added = store.snapshot().events.slice(0, store.snapshot().events.length - before + 0).filter((e) => e.subjectId === person.id && e.at > new Date(Date.now() - 60000).toISOString());
  assert.deepEqual(added.map((e) => e.changes[0].field), ["name"]);
  assert.equal(store.getPerson(person.id).workRole, "");
});
