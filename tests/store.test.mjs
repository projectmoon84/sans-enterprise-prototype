import test from "node:test";
import assert from "node:assert/strict";
import { seed } from "../src/data.js";
import {
  createStore,
  migrateV2,
  seedDatabase,
  validateStoreDatabase,
  STORAGE_KEY,
  LEGACY_STORAGE_KEY,
} from "../src/store.js";

const memoryStorage = (initial = {}) => {
  const items = { ...initial };
  return {
    items,
    getItem: (key) => items[key] ?? null,
    setItem: (key, value) => {
      items[key] = String(value);
    },
  };
};
const student = (over = {}) => ({
  name: "New Person",
  email: "new.person@example.com",
  voucher: "Cyber Defense FY26",
  ...over,
});

test("v2 migration produces one person per email and keeps both roles", () => {
  const v2 = seed();
  const data = migrateV2(v2);
  const emails = data.people.map((p) => p.email);
  assert.equal(new Set(emails).size, emails.length);
  assert.equal(data.people.length, v2.users.length - 2);
  const ada = data.people.find((p) => p.email === "ada.whitfield@example.com");
  assert.ok(ada.portal && ada.student);
  assert.equal(ada.portal.role, "Admin");
  assert.equal(data.people.filter((p) => p.portal).length, 9);
  assert.equal(data.people.filter((p) => p.student).length, 14);
  assert.equal(validateStoreDatabase(data), data);
});

test("migration turns names into ids and preserves legacy activity as events", () => {
  const v2 = seed();
  v2.activity.push({
    id: "a1",
    message: "Old note",
    time: "2026-10-01T09:00:00.000Z",
  });
  const data = migrateV2(v2);
  assert.ok(data.vouchers.every((v) => v.id && v.adminGroupIds.length));
  const portal = data.people.find((p) => p.portal).portal;
  assert.ok(
    portal.voucherIds.every((id) => data.vouchers.some((v) => v.id === id)),
  );
  const legacy = data.events.find((event) => event.action === "legacy.note");
  assert.equal(legacy.legacyMessage, "Old note");
});

test("a v2 snapshot in browser storage is migrated and saved under the v3 key", () => {
  const storage = memoryStorage({
    [LEGACY_STORAGE_KEY]: JSON.stringify(seed()),
  });
  const store = createStore({ storage });
  assert.equal(store.snapshot().version, 3);
  assert.equal(JSON.parse(storage.items[STORAGE_KEY]).version, 3);
});

test("the legacy view keeps the flat shape the screens read", () => {
  const view = createStore().view();
  assert.equal(view.users.filter((u) => u.type === "portal").length, 9);
  assert.equal(view.users.filter((u) => u.type === "student").length, 14);
  assert.ok(view.users.every((u) => /--(portal|student)$/.test(u.id)));
  assert.ok(
    view.users
      .filter((u) => u.type === "student")
      .every(
        (u) =>
          u.vouchers.length === 1 &&
          u.groups.length <= 1 &&
          u.teams.length <= 1,
      ),
  );
});

test("adding a student with an existing portal email attaches a role to the same person", () => {
  const store = createStore();
  const before = store.snapshot().people.length;
  const marcus = store
    .snapshot()
    .people.find((p) => p.email === "marcus.okonjo@example.com");
  assert.ok(marcus.portal && !marcus.student);
  store.addStudent(
    student({ name: "Ignored", email: "marcus.okonjo@example.com" }),
  );
  const after = store.snapshot();
  assert.equal(after.people.length, before);
  const updated = after.people.find((p) => p.id === marcus.id);
  assert.ok(updated.student);
  assert.equal(updated.name, marcus.name);
});

test("duplicate roles for one email are rejected", () => {
  const store = createStore();
  store.addStudent(student());
  assert.throws(() => store.addStudent(student()), /already a student/);
});

test("role rules: students need a voucher, Limited Admins have one voucher, groups must be covered", () => {
  const store = createStore();
  assert.throws(() => store.addStudent(student({ voucher: "" })), /voucher/);
  assert.throws(
    () =>
      store.addStudent(
        student({ voucher: "Offensive Ops FY26", group: "APAC Operations" }),
      ),
    /not covered|invalid/i,
  );
  assert.throws(
    () =>
      store.invitePortalUser({
        name: "Lim Ited",
        email: "lim.ited@example.com",
        role: "Limited Admin",
        vouchers: ["Cyber Defense FY26", "Cloud Security FY26"],
        groups: ["Federal Division"],
        teams: [],
      }),
    /invalid portal access/,
  );
});

test("a failed command leaves the database unchanged", () => {
  const store = createStore();
  const before = JSON.stringify(store.snapshot());
  assert.throws(() =>
    store.addStudents([
      student(),
      student({ email: "second@example.com", voucher: "" }),
    ]),
  );
  assert.equal(JSON.stringify(store.snapshot()), before);
});

test("archiving keeps the record but hides it from lists", () => {
  const store = createStore();
  const target = store
    .view()
    .users.find((u) => u.type === "student" && !store.getPerson(u.id).portal);
  store.archivePerson(target.id);
  const snap = store.snapshot();
  assert.ok(snap.people.find((p) => p.id === target.personId).archivedAt);
  assert.ok(!store.listStudents().some((p) => p.id === target.personId));
  assert.ok(!store.view().users.some((u) => u.personId === target.personId));
});

test("archiving a dual-role person hides both role rows", () => {
  const store = createStore();
  const ada = store
    .view()
    .users.filter((u) => u.email === "ada.whitfield@example.com");
  assert.equal(ada.length, 2);
  store.archivePerson(ada.find((u) => u.type === "student").id);
  const left = store
    .view()
    .users.filter((u) => u.email === "ada.whitfield@example.com");
  assert.deepEqual(left, []);
});

test("status, bulk status, team and CSV commands persist", () => {
  const storage = memoryStorage();
  const store = createStore({ storage });
  const row = store
    .view()
    .users.find((u) => u.type === "student" && u.status === "Pending invite");
  store.changeStatus(row.id, "Active");
  assert.equal(
    store.view().users.find((u) => u.id === row.id).status,
    "Active",
  );
  store.createTeam("Incident Response");
  assert.throws(() => store.createTeam("incident response"), /unique/);
  const ids = store.addStudents([
    student(),
    student({ email: "two@example.com", team: "Incident Response" }),
  ]);
  assert.equal(ids.length, 2);
  store.commitCsvImport([student({ email: "three@example.com" })]);
  const reloaded = createStore({ storage });
  assert.equal(
    reloaded.snapshot().people.length,
    store.snapshot().people.length,
  );
  assert.ok(
    reloaded
      .view()
      .users.some(
        (u) =>
          u.email === "two@example.com" && u.teams[0] === "Incident Response",
      ),
  );
});

test("team lookups separate members from access", () => {
  const store = createStore();
  const team = store.snapshot().teams[0];
  assert.ok(
    store.peopleInTeam(team.id).every((p) => p.student.teamId === team.id),
  );
  assert.ok(
    store
      .peopleWithTeamAccess(team.id)
      .every((p) => p.portal.teamIds.includes(team.id)),
  );
});

test("snapshots export and import round-trip", () => {
  const a = createStore();
  a.addStudent(student());
  const b = createStore();
  b.replaceDatabase(a.snapshot());
  assert.deepEqual(b.snapshot(), a.snapshot());
  assert.throws(
    () => b.replaceDatabase({ version: 3, people: [] }),
    /valid prototype/,
  );
});

test("storage failures surface as a storage error and leave data intact", () => {
  const storage = memoryStorage();
  const store = createStore({ storage });
  storage.setItem = () => {
    throw new Error("quota");
  };
  assert.throws(
    () => store.createTeam("Blocked"),
    (e) => e.code === "storage",
  );
  assert.ok(!store.snapshot().teams.some((t) => t.name === "Blocked"));
});

test("seed database validates", () => {
  assert.equal(seedDatabase().version, 3);
});
