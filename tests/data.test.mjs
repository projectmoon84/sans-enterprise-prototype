import test from "node:test";
import assert from "node:assert/strict";
import {
  seed,
  parseCSV,
  validateCandidate,
  validateDatabase,
  groupsForVouchers,
  VOUCHERS,
  GROUPS,
} from "../src/data.js";
test("seed provides 9 portal users and 14 students with unique identities", () => {
  const d = seed();
  assert.equal(d.users.filter((u) => u.type === "portal").length, 9);
  assert.equal(d.users.filter((u) => u.type === "student").length, 14);
  assert.equal(new Set(d.users.map((u) => u.id)).size, 23);
  assert.equal(validateDatabase(d), d);
});
test("CSV handles BOM, quoted commas, CRLF, escaped quotes and embedded newlines", () => {
  const rows = parseCSV(
    '\uFEFFname,email,voucher\r\n"Chen, Alex",alex@example.com,Cyber Defense FY26\r\n"Sam ""S""\nKhan",sam@example.com,Cloud Security FY26',
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, "Chen, Alex");
  assert.equal(rows[1].name, 'Sam "S"\nKhan');
});
test("malformed CSV has useful failures", () => {
  assert.throws(() => parseCSV("name\nAlex"), /email column/);
  assert.throws(() => parseCSV('email,name\na@b.com,"oops'), /not closed/);
  assert.throws(() => parseCSV("email\n"), /at least one/);
});
test("validation identifies invalid assignments and duplicates without treating a row as its own duplicate", () => {
  const r = {
    email: "alex@example.com",
    voucher: VOUCHERS[0],
    group: "Federal Division",
    team: "Security Operations",
  };
  assert.deepEqual(validateCandidate(r, [], [r]), []);
  assert.match(
    validateCandidate(r, [{ email: "ALEX@example.com" }])[0],
    /already a student/,
  );
  assert.match(validateCandidate(r, [], [{ ...r }])[0], /Duplicate/);
  assert.match(validateCandidate({ ...r, voucher: "" })[0], /voucher/);
  assert.match(validateCandidate({ ...r, email: "invalid" })[0], /email/);
});
test("new teams can be assigned when present in the mock database", () => {
  assert.deepEqual(
    validateCandidate(
      { email: "a@b.com", voucher: VOUCHERS[0], team: "Incident Response" },
      [],
      [],
      { teams: ["Incident Response"], groups: [] },
    ),
    [],
  );
});
test("database import rejects malformed and duplicate records", () => {
  assert.throws(() => validateDatabase({ users: [] }), /valid prototype/);
  const d = seed();
  d.users.push({ ...d.users[0], id: "another" });
  assert.throws(() => validateDatabase(d), /duplicate user/);
});

test("vouchers sit above admin groups and narrow the groups on offer", () => {
  assert.deepEqual(groupsForVouchers([]), []);
  assert.deepEqual(groupsForVouchers(["Offensive Ops FY26"]), [
    "Federal Division",
  ]);
  assert.deepEqual(
    groupsForVouchers(["Offensive Ops FY26", "Cloud Security FY26"]),
    GROUPS,
  );
});
test("a student admin group must be covered by their voucher, and is optional", () => {
  const r = {
    email: "a@b.com",
    voucher: "Offensive Ops FY26",
    group: "APAC Operations",
  };
  assert.match(validateCandidate(r)[0], /not covered/);
  assert.deepEqual(validateCandidate({ ...r, group: "" }), []);
});
test("one person can be both a portal user and a student, but not two students", () => {
  const d = seed();
  const ada = d.users.filter((u) => u.email === "ada.whitfield@example.com");
  assert.deepEqual(ada.map((u) => u.type).sort(), ["portal", "student"]);
  assert.deepEqual(
    validateCandidate(
      { email: "ada.whitfield@example.com", voucher: VOUCHERS[0] },
      [{ email: "ada.whitfield@example.com", type: "portal" }],
    ),
    [],
  );
  assert.match(
    validateCandidate(
      { email: "ken.adeyemi@example.com", voucher: VOUCHERS[0] },
      d.users,
    )[0],
    /already a student/,
  );
});
test("students hold exactly one voucher and at most one admin group and team", () => {
  const d = seed();
  assert.ok(
    d.users
      .filter((u) => u.type === "student")
      .every(
        (u) =>
          u.vouchers.length === 1 &&
          u.groups.length <= 1 &&
          u.teams.length <= 1,
      ),
  );
  const s = d.users.find((u) => u.type === "student");
  s.vouchers = [...VOUCHERS.slice(0, 2)];
  assert.throws(() => validateDatabase(d), /invalid/);
});

test("readStudentCSV matches forgiving headings and reports ignored columns", async () => {
  const { readStudentCSV } = await import("../src/data.js");
  const out = readStudentCSV(
    "﻿First name,Surname,E-mail address,Department,Job title\nPat,Kerr,pat.kerr@example.com,Finance,\n",
  );
  assert.equal(out.rows[0].name, "Pat Kerr");
  assert.equal(out.rows[0].email, "pat.kerr@example.com");
  assert.equal(out.rows[0].workRole, "", "a blank work role stays blank");
  assert.deepEqual(out.ignored, ["Department"]);
  assert.ok(out.missing.includes("Voucher"));
});

test("template headings with (required) are understood", async () => {
  const { readStudentCSV } = await import("../src/data.js");
  const out = readStudentCSV("Name,Email (required),Voucher,Admin group,Team,Work role\nA,a@b.co,,,,\n");
  assert.equal(out.matched.length, 6);
  assert.equal(out.ignored.length, 0);
});

test("Title and Division columns are not guessed as work role or admin group", async () => {
  const { readStudentCSV } = await import("../src/data.js");
  const out = readStudentCSV("Title,Name,Email,Division\nDr,Sam Lee,sam@example.com,Finance\n");
  assert.equal(out.rows[0].workRole, "", "an honorific must not become a work role");
  assert.equal(out.rows[0].group, "");
  assert.deepEqual(out.ignored, ["Title", "Division"]);
});
