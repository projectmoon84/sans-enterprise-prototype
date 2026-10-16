import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../src/store.js";
import { describeEvent, eventsFor } from "../src/activity.js";

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

test("every user-facing store command writes an event", () => {
  const cases = [
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
