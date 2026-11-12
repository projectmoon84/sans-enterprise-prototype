import {
  GROUPS,
  TEAMS,
  VOUCHERS,
  ROLES,
  VOUCHER_GROUPS,
  TEAM_DESCRIPTIONS,
  uid,
  seed,
  validateDatabase,
} from "./data.js";
import { runBulk } from "./bulk-engine.js";
import { personPermissions } from "./alerts.js";
import {
  COURSES,
  ENROLMENT_STATUSES,
  CURRENT_STATUSES,
  buildTrainingSeed,
  courseLabel,
} from "./training.js";

// The standalone build strips imports, so aliases are plain constants.
const legacySeed = seed;
const validateLegacyDatabase = validateDatabase;

export const STORAGE_KEY = "sans-enterprise-prototype-v3";
export const LEGACY_STORAGE_KEY = "sans-enterprise-prototype-v2";

const ROLE_STATUSES = ["Pending invite", "Active", "Suspended"];
// A student imported without a voucher is held, not invited, until one is assigned.
const STUDENT_STATUSES = [...ROLE_STATUSES, "Needs voucher"];
const MAX_DRAFT_ROWS = 500;
const PORTAL_ROLES = [...ROLES, "SSO Admin"];
const normalEmail = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();
const isoNow = () => new Date().toISOString();
const slug = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const recordId = (kind, name) => `${kind}-${slug(name)}`;
const roleRowId = (personId, type) => `${personId}--${type}`;
const personIdFrom = (id) =>
  String(id || "").replace(/--(?:portal|student)$/, "");
const roleFromRowId = (id) =>
  String(id || "").match(/--(portal|student)$/)?.[1];

export function logEvent(data, event) {
  const actorId = event.actorId || data.session.actorId;
  const actor = data.people.find((person) => person.id === actorId);
  const subject = event.subjectId
    ? data.people.find((person) => person.id === personIdFrom(event.subjectId))
    : undefined;
  const entry = {
    id: event.id || uid(),
    at: event.at || isoNow(),
    actorId,
    actorName:
      event.actorName ||
      actor?.name ||
      (actorId === "sans" ? "SANS" : "System"),
    ...(subject
      ? { subjectId: subject.id, subjectName: subject.name }
      : event.subjectId
        ? {
            subjectId: personIdFrom(event.subjectId),
            subjectName: event.subjectName || "Unknown person",
          }
        : {}),
    action: event.action,
    ...(event.target ? { target: structuredClone(event.target) } : {}),
    ...(event.changes?.length
      ? { changes: structuredClone(event.changes) }
      : {}),
    ...(event.batchId ? { batchId: event.batchId } : {}),
    ...(event.via ? { via: event.via } : {}),
    ...(event.legacyMessage ? { legacyMessage: event.legacyMessage } : {}),
  };
  data.events.unshift(entry);
  return entry;
}

function targetRecord(type, record) {
  return record ? { type, id: record.id, name: record.name } : undefined;
}

const SEED_BASE = Date.parse("2026-10-16T10:00:00.000Z");

// Adds the mock course catalog and training histories to data that has none,
// so older saved databases pick them up on load.
function ensureImportDrafts(data) {
  if (!Array.isArray(data.importDrafts)) data.importDrafts = [];
}

function ensureTraining(data) {
  if (Array.isArray(data.courses)) return;
  data.courses = structuredClone(COURSES);
  const seeded = buildTrainingSeed(data, SEED_BASE);
  data.courseEnrolments = seeded.courseEnrolments;
  data.certifications = seeded.certifications;
  for (const event of seeded.events) logEvent(data, event);
  data.events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

function seedHistory(data) {
  const actors = data.people.filter((person) => person.portal);
  const subjects = data.people.filter(
    (person) => person.student || person.portal,
  );
  if (!actors.length || !subjects.length) return;
  const base = Date.parse("2026-10-16T10:00:00.000Z");
  const actions = [
    "student.invited",
    "student.team_changed",
    "portal.invited",
    "student.voucher_changed",
    "portal.suspended",
    "portal.invite_accepted",
  ];
  for (let index = 0; index < 60; index++) {
    let subject = subjects[index % subjects.length];
    let action = actions[index % actions.length];
    if (action.startsWith("student.") && !subject.student)
      subject = data.people.find((person) => person.student) || subject;
    if (action.startsWith("portal.") && !subject.portal)
      subject = data.people.find((person) => person.portal) || subject;
    // Someone never acts on themselves in the seed history, except to accept their own invitation.
    let actor = actors[(index + 2) % actors.length];
    if (actor.id === subject.id && !action.endsWith("invite_accepted"))
      actor = actors[(index + 3) % actors.length];
    const team = data.teams[index % data.teams.length];
    const previousTeam = data.teams[(index + 1) % data.teams.length];
    const voucher = data.vouchers[index % data.vouchers.length];
    const previousVoucher = data.vouchers[(index + 1) % data.vouchers.length];
    const details = {
      action,
      actorId: action.endsWith("invite_accepted") ? subject.id : actor.id,
      subjectId: subject.id,
      at: new Date(base - index * 31 * 60 * 60 * 1000).toISOString(),
      via: index % 11 === 0 ? "bulk" : "system",
    };
    if (action === "student.invited")
      Object.assign(details, {
        target: targetRecord("voucher", voucher),
        changes: [{ field: "student", from: null, to: "Pending invite" }],
      });
    if (action === "student.team_changed")
      Object.assign(details, {
        target: targetRecord("team", team),
        changes: [{ field: "team", from: previousTeam.name, to: team.name }],
      });
    if (action === "portal.invited")
      details.changes = [
        { field: "role", from: null, to: subject.portal.role },
      ];
    if (action === "student.voucher_changed")
      Object.assign(details, {
        target: targetRecord("voucher", voucher),
        changes: [
          {
            field: "voucher",
            from: previousVoucher.name,
            to: voucher.name,
          },
        ],
      });
    if (action === "portal.suspended")
      details.changes = [{ field: "status", from: "Active", to: "Suspended" }];
    if (action === "portal.invite_accepted")
      details.changes = [
        { field: "status", from: "Pending invite", to: "Active" },
      ];
    logEvent(data, details);
  }
  const csvBatch = "seed-csv-october";
  const csvSubjects = data.people
    .filter((person) => person.student)
    .slice(0, 3);
  // The importer is never one of the people they imported.
  const csvActor =
    actors.find((actor) => !csvSubjects.some((subject) => subject.id === actor.id)) ||
    actors[0];
  csvSubjects.forEach((subject, index) =>
    logEvent(data, {
      action: "student.invited",
      actorId: csvActor.id,
      subjectId: subject.id,
      target: targetRecord("voucher", data.vouchers[index]),
      batchId: csvBatch,
      via: "csv",
      at: new Date(
        base - 42 * 24 * 60 * 60 * 1000 - index * 1000,
      ).toISOString(),
    }),
  );
  logEvent(data, {
    action: "import.completed",
    actorId: csvActor.id,
    batchId: csvBatch,
    via: "csv",
    changes: [
      { field: "count", from: 0, to: csvSubjects.length },
      { field: "file", from: null, to: "october-students.csv" },
    ],
    at: new Date(base - 42 * 24 * 60 * 60 * 1000 + 1000).toISOString(),
  });
  data.events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

function findByName(records, name, label) {
  const record = records.find(
    (item) => item.name.toLowerCase() === String(name || "").toLowerCase(),
  );
  if (!record) throw Error(`Choose a valid ${label}.`);
  return record;
}

function namesFor(records, ids) {
  return (ids || [])
    .map((id) => records.find((item) => item.id === id)?.name)
    .filter(Boolean);
}

function idsFor(records, names, label) {
  return (names || []).map((name) => findByName(records, name, label).id);
}

function makeDirectories(source = {}) {
  const groupNames = [...new Set([...(source.groups || []), ...GROUPS])];
  const teamNames = [...new Set([...(source.teams || []), ...TEAMS])];
  const voucherNames = [
    ...new Set([
      ...VOUCHERS,
      ...(source.users || []).flatMap((user) => user.vouchers || []),
    ]),
  ];
  const adminGroups = groupNames.map((name) => ({
    id: recordId("admin-group", name),
    name,
  }));
  const vouchers = voucherNames.map((name) => ({
    id: recordId("voucher", name),
    name,
    adminGroupIds: (VOUCHER_GROUPS[name] || groupNames).map(
      (group) => findByName(adminGroups, group, "admin group").id,
    ),
  }));
  const teams = teamNames.map((name) => ({
    id: recordId("team", name),
    name,
    description: TEAM_DESCRIPTIONS[name] || "",
    createdAt: "2026-10-15T09:00:00.000Z",
    createdBy: "system",
  }));
  return { vouchers, adminGroups, teams };
}

export function migrateV2(input) {
  const source = validateLegacyDatabase(structuredClone(input));
  const directories = makeDirectories(source);
  const grouped = new Map();
  for (const user of source.users) {
    const email = normalEmail(user.email);
    if (!grouped.has(email)) grouped.set(email, []);
    grouped.get(email).push(user);
  }
  const people = [...grouped.entries()].map(([email, records]) => {
    const portal = records.find((user) => user.type === "portal");
    const student = records.find((user) => user.type === "student");
    const preferred = student || portal;
    const timestamps = records
      .map((user) => user.updatedAt)
      .filter((value) => Number.isFinite(Date.parse(value)))
      .sort();
    return {
      id: (student || portal).id,
      name: preferred.name,
      email,
      workRole: student?.workRole || portal?.workRole || "",
      sansAccount: records.some((user) => user.accountSetup)
        ? "awaiting"
        : "linked",
      createdAt: timestamps[0] || isoNow(),
      updatedAt: timestamps.at(-1) || isoNow(),
      ...(portal
        ? {
            portal: {
              role: portal.role,
              status: portal.status,
              voucherIds: idsFor(
                directories.vouchers,
                portal.vouchers,
                "voucher",
              ),
              adminGroupIds: idsFor(
                directories.adminGroups,
                portal.groups,
                "admin group",
              ),
              teamIds: idsFor(directories.teams, portal.teams, "team"),
              invitedAt: portal.updatedAt,
              invitedBy: "system",
              accessLabel: portal.accessLabel,
              lastAccess: portal.lastAccess,
            },
          }
        : {}),
      ...(student
        ? {
            student: {
              status: student.status,
              voucherId: idsFor(
                directories.vouchers,
                student.vouchers,
                "voucher",
              )[0],
              adminGroupId: idsFor(
                directories.adminGroups,
                student.groups,
                "admin group",
              )[0],
              teamId: idsFor(directories.teams, student.teams, "team")[0],
              invitedAt: student.updatedAt,
              invitedBy: "system",
            },
          }
        : {}),
    };
  });
  const defaultActor =
    people.find((person) => person.email === "ada.whitfield@example.com")?.id ||
    "system";
  for (const person of people) {
    if (person.portal) person.portal.invitedBy = defaultActor;
    if (person.student) person.student.invitedBy = defaultActor;
  }
  // Spread pending invitations over the last 10 days so some are overdue.
  const INVITE_AGES = [1, 3, 6, 9, 2, 8];
  let pending = 0;
  for (const person of people)
    for (const access of [person.portal, person.student])
      if (access?.status === "Pending invite")
        access.invitedAt = new Date(
          SEED_BASE - INVITE_AGES[pending++ % INVITE_AGES.length] * 24 * 60 * 60 * 1000,
        ).toISOString();
  const data = {
    version: 3,
    people,
    ...directories,
    events: [],
    session: { actorId: defaultActor },
  };
  seedHistory(data);
  for (const entry of source.activity || []) {
    logEvent(data, {
      action: "legacy.note",
      actorId: "system",
      actorName: "System",
      at: entry.time,
      legacyMessage: entry.message,
    });
  }
  ensureTraining(data);
  ensureImportDrafts(data);
  data.events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return validateStoreDatabase(data);
}

export function seedDatabase() {
  return migrateV2(legacySeed());
}

function validateTraining(data) {
  const fail = () => {
    throw Error("The database contains invalid training records.");
  };
  if (
    !Array.isArray(data.courses) ||
    !Array.isArray(data.courseEnrolments) ||
    !Array.isArray(data.certifications)
  )
    fail();
  const courseIds = new Set(data.courses.map((course) => course.id));
  if (courseIds.size !== data.courses.length) fail();
  const people = new Set(data.people.map((person) => person.id));
  const vouchers = new Set(data.vouchers.map((voucher) => voucher.id));
  const seen = new Set();
  for (const item of data.courseEnrolments) {
    if (
      typeof item?.id !== "string" ||
      seen.has(item.id) ||
      !people.has(item.personId) ||
      !courseIds.has(item.courseId) ||
      !vouchers.has(item.voucherId) ||
      !ENROLMENT_STATUSES.includes(item.status) ||
      !(item.progress >= 0 && item.progress <= 100)
    )
      fail();
    seen.add(item.id);
  }
  for (const cert of data.certifications) {
    if (
      typeof cert?.id !== "string" ||
      !people.has(cert.personId) ||
      !Number.isFinite(Date.parse(cert.issuedAt)) ||
      !Number.isFinite(Date.parse(cert.expiresAt))
    )
      fail();
  }
}

export function validateStoreDatabase(data) {
  if (
    data?.version !== 3 ||
    !Array.isArray(data.people) ||
    !Array.isArray(data.vouchers) ||
    !Array.isArray(data.adminGroups) ||
    !Array.isArray(data.teams) ||
    !Array.isArray(data.events) ||
    typeof data.session?.actorId !== "string"
  )
    throw Error("Choose a valid prototype database export.");
  if (data.people.length > 5000)
    throw Error("The database is too large for this prototype.");

  const uniqueRecords = (records, label) => {
    const ids = new Set();
    const names = new Set();
    for (const record of records) {
      const name = record?.name?.toLowerCase();
      if (
        typeof record?.id !== "string" ||
        typeof record?.name !== "string" ||
        ids.has(record.id) ||
        names.has(name)
      )
        throw Error(`The database contains an invalid or duplicate ${label}.`);
      ids.add(record.id);
      names.add(name);
    }
    return ids;
  };
  const voucherIds = uniqueRecords(data.vouchers, "voucher");
  const groupIds = uniqueRecords(data.adminGroups, "admin group");
  const teamIds = uniqueRecords(data.teams, "team");
  for (const voucher of data.vouchers) {
    if (
      !Array.isArray(voucher.adminGroupIds) ||
      voucher.adminGroupIds.some((id) => !groupIds.has(id))
    )
      throw Error("The database contains an invalid voucher scope.");
  }

  const personIds = new Set();
  const emails = new Set();
  for (const person of data.people) {
    const email = normalEmail(person?.email);
    if (
      typeof person?.id !== "string" ||
      personIds.has(person.id) ||
      typeof person?.name !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      emails.has(email) ||
      typeof person?.workRole !== "string" ||
      !["linked", "awaiting"].includes(person?.sansAccount) ||
      !Number.isFinite(Date.parse(person?.createdAt)) ||
      (person.archivedAt && !Number.isFinite(Date.parse(person.archivedAt))) ||
      (!person.portal && !person.student && !person.archivedAt)
    )
      throw Error("The database contains an invalid or duplicate person.");
    personIds.add(person.id);
    emails.add(email);

    if (person.portal) {
      const access = person.portal;
      if (
        !PORTAL_ROLES.includes(access.role) ||
        !ROLE_STATUSES.includes(access.status) ||
        !Array.isArray(access.voucherIds) ||
        !access.voucherIds.length ||
        access.voucherIds.some((id) => !voucherIds.has(id)) ||
        !Array.isArray(access.adminGroupIds) ||
        !access.adminGroupIds.length ||
        access.adminGroupIds.some((id) => !groupIds.has(id)) ||
        !Array.isArray(access.teamIds) ||
        access.teamIds.some((id) => !teamIds.has(id)) ||
        (access.role === "Limited Admin" && access.voucherIds.length !== 1)
      )
        throw Error("The database contains invalid portal access.");
      const covered = new Set(
        access.voucherIds.flatMap(
          (id) =>
            data.vouchers.find((voucher) => voucher.id === id)?.adminGroupIds ||
            [],
        ),
      );
      if (access.adminGroupIds.some((id) => !covered.has(id)))
        throw Error("A portal admin group is not covered by its vouchers.");
    }
    if (person.student) {
      const enrolment = person.student;
      const voucher = data.vouchers.find(
        (item) => item.id === enrolment.voucherId,
      );
      const needsVoucher = enrolment.status === "Needs voucher";
      if (
        !STUDENT_STATUSES.includes(enrolment.status) ||
        // A voucher is present exactly when the student is not waiting for one.
        needsVoucher === Boolean(enrolment.voucherId) ||
        (enrolment.voucherId && !voucher) ||
        (enrolment.adminGroupId && !groupIds.has(enrolment.adminGroupId)) ||
        (voucher &&
          enrolment.adminGroupId &&
          !voucher.adminGroupIds.includes(enrolment.adminGroupId)) ||
        (enrolment.teamId && !teamIds.has(enrolment.teamId))
      )
        throw Error("The database contains invalid student details.");
    }
  }
  validateTraining(data);
  if (
    !Array.isArray(data.importDrafts) ||
    data.importDrafts.some(
      (draft) =>
        typeof draft?.id !== "string" ||
        !Array.isArray(draft.rows) ||
        draft.rows.length > MAX_DRAFT_ROWS,
    )
  )
    throw Error("The database contains an invalid saved import.");
  if (
    data.session.actorId !== "system" &&
    !data.people.some(
      (person) => person.id === data.session.actorId && person.portal,
    )
  )
    throw Error("The database contains an invalid signed-in user.");
  if (
    data.events.some(
      (event) =>
        !event ||
        typeof event.id !== "string" ||
        typeof event.at !== "string" ||
        !Number.isFinite(Date.parse(event.at)) ||
        typeof event.actorId !== "string" ||
        typeof event.actorName !== "string" ||
        typeof event.action !== "string" ||
        (event.subjectId && typeof event.subjectName !== "string") ||
        (event.changes && !Array.isArray(event.changes)),
    )
  )
    throw Error("The database contains invalid events.");
  return data;
}

export function normaliseDatabase(data) {
  if (data?.version === 3) {
    const next = structuredClone(data);
    if (
      !Array.isArray(next.people) ||
      !Array.isArray(next.vouchers) ||
      !Array.isArray(next.adminGroups) ||
      !Array.isArray(next.teams)
    )
      throw Error("Choose a valid prototype database export.");
    if (!Array.isArray(next.events)) {
      const actorId =
        next.people.find(
          (person) =>
            person.email === "ada.whitfield@example.com" && person.portal,
        )?.id || "system";
      next.events = [];
      next.session = { actorId };
      seedHistory(next);
      for (const entry of next.activity || [])
        logEvent(next, {
          action: "legacy.note",
          actorId: "system",
          actorName: "System",
          at: entry.time,
          legacyMessage: entry.message,
        });
      delete next.activity;
    }
    ensureTraining(next);
    ensureImportDrafts(next);
    return validateStoreDatabase(next);
  }
  return migrateV2(data);
}

export function getPerson(data, id) {
  return data.people.find((person) => person.id === personIdFrom(id));
}

function matches(person, filters) {
  if (person.archivedAt) return false;
  const text = normalEmail(filters.search);
  return (
    (!text || `${person.name} ${person.email}`.toLowerCase().includes(text)) &&
    (!filters.email || person.email === normalEmail(filters.email))
  );
}

export function listPortalUsers(data, filters = {}) {
  return data.people.filter(
    (person) =>
      person.portal &&
      matches(person, filters) &&
      (!filters.role || person.portal.role === filters.role) &&
      (!filters.status || person.portal.status === filters.status),
  );
}

export function listStudents(data, filters = {}) {
  return data.people.filter(
    (person) =>
      person.student &&
      matches(person, filters) &&
      (!filters.status || person.student.status === filters.status),
  );
}

export function peopleInTeam(data, id) {
  return listStudents(data).filter((person) => person.student.teamId === id);
}

export function peopleWithTeamAccess(data, id) {
  return listPortalUsers(data).filter((person) =>
    person.portal.teamIds.includes(id),
  );
}

// "Last modified by" comes from the newest event that changed this person's
// record. Training and certification events from SANS are not edits.
function lastModifiedIndex(data) {
  const latest = new Map();
  for (const event of data.events) {
    if (
      !event.subjectId ||
      event.actorId === "sans" ||
      /^(training|certification)\./.test(event.action)
    )
      continue;
    const current = latest.get(event.subjectId);
    if (!current || Date.parse(event.at) > Date.parse(current.at))
      latest.set(event.subjectId, event);
  }
  return latest;
}
function lastModified(person, latest, data) {
  const event = latest.get(person.id);
  if (!event) return { updatedAt: person.updatedAt || person.createdAt };
  const actor = data.people.find((candidate) => candidate.id === event.actorId);
  return {
    updatedAt: event.at,
    lastModifiedBy: event.actorName,
    lastModifiedAt: event.at,
    lastModifiedRole: actor?.portal?.role,
  };
}

export function legacyView(data) {
  const last = lastModifiedIndex(data);
  const users = [];
  for (const person of data.people.filter((item) => !item.archivedAt)) {
    const shared = {
      name: person.name,
      email: person.email,
      workRole: person.workRole,
      accountSetup: person.sansAccount === "awaiting",
      updatedAt: person.updatedAt || person.createdAt,
      ...lastModified(person, last, data),
      personId: person.id,
    };
    if (person.portal) {
      users.push({
        ...shared,
        id: roleRowId(person.id, "portal"),
        type: "portal",
        role: person.portal.role,
        status: person.portal.status,
        vouchers: namesFor(data.vouchers, person.portal.voucherIds),
        groups: namesFor(data.adminGroups, person.portal.adminGroupIds),
        teams: namesFor(data.teams, person.portal.teamIds),
        accessLabel: person.portal.accessLabel,
        lastAccess: person.portal.lastAccess,
      });
    }
    if (person.student) {
      users.push({
        ...shared,
        id: roleRowId(person.id, "student"),
        type: "student",
        role: "Student",
        status: person.student.status,
        vouchers: namesFor(data.vouchers, [person.student.voucherId]),
        groups: namesFor(data.adminGroups, [person.student.adminGroupId]),
        teams: namesFor(data.teams, [person.student.teamId]),
      });
    }
  }
  return {
    version: 3,
    users,
    vouchers: data.vouchers.map((item) => item.name),
    groups: data.adminGroups.map((item) => item.name),
    teams: data.teams.map((item) => item.name),
    events: structuredClone(data.events),
    session: structuredClone(data.session),
    importDrafts: structuredClone(data.importDrafts),
  };
}

function updatePersonDetails(data, person, input) {
  const name = String(input.name || "").trim();
  const email = normalEmail(input.email);
  if (!name) throw Error("Enter a name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw Error("Enter a valid email address.");
  if (
    data.people.some(
      (candidate) =>
        candidate.id !== person.id && normalEmail(candidate.email) === email,
    )
  )
    throw Error("This email already belongs to another person.");
  person.name = name;
  person.email = email;
  if (input.workRole !== undefined)
    person.workRole =
      String(input.workRole || "").trim() || (person.student ? "Student" : "");
  person.updatedAt = isoNow();
}

// A person who already exists keeps their name and work role when they gain a second role.
function existingOr(person, input) {
  return person.createdAt && person.name
    ? { ...input, name: person.name, workRole: undefined }
    : input;
}

function portalAccessFrom(data, input, existing = {}) {
  const role = input.role;
  const voucherIds = idsFor(data.vouchers, input.vouchers, "voucher");
  const adminGroupIds = idsFor(data.adminGroups, input.groups, "admin group");
  const teamIds = idsFor(data.teams, input.teams || [], "team");
  return {
    ...existing,
    role,
    status: input.status || existing.status || "Pending invite",
    voucherIds,
    adminGroupIds,
    teamIds,
    invitedAt: existing.invitedAt || isoNow(),
    invitedBy: existing.invitedBy || "system",
    accessLabel: undefined,
    lastAccess: undefined,
  };
}

function studentDetailsFrom(data, input, existing = {}) {
  const voucherName = input.voucher || input.vouchers?.[0];
  const voucher = voucherName
    ? findByName(data.vouchers, voucherName, "voucher")
    : undefined;
  // Only the CSV import, or a student who is already waiting for one, may lack a voucher.
  if (!voucher && !input.allowNoVoucher && existing.status !== "Needs voucher")
    throw Error("Choose a valid voucher.");
  const waiting = existing.status === "Needs voucher";
  let status = input.status || existing.status || "Pending invite";
  if (!voucher) status = "Needs voucher";
  else if (status === "Needs voucher" || waiting) {
    // Assigning a voucher releases the held invitation, unless a status was chosen explicitly.
    status = ["Active", "Suspended"].includes(input.status) ? input.status : "Pending invite";
  }
  const group =
    input.group || input.groups?.[0]
      ? findByName(data.adminGroups, input.group || input.groups[0], "admin group")
      : undefined;
  if (voucher && group && !voucher.adminGroupIds.includes(group.id))
    throw Error("Admin group not covered by this voucher.");
  const next = {
    ...existing,
    status,
    adminGroupId: group?.id,
    teamId:
      input.team || input.teams?.[0]
        ? findByName(data.teams, input.team || input.teams[0], "team").id
        : undefined,
    invitedAt: waiting && voucher ? isoNow() : existing.invitedAt || isoNow(),
    invitedBy: existing.invitedBy || "system",
  };
  if (voucher) next.voucherId = voucher.id;
  else delete next.voucherId;
  return next;
}

function statusAction(type, from, to) {
  if (from === to) return null;
  if (to === "Suspended") return `${type}.suspended`;
  if (to === "Active" && from === "Pending invite")
    return `${type}.invite_accepted`;
  if (to === "Active") return `${type}.reactivated`;
  return null;
}

function logDetailChanges(data, person, before, via = "profile") {
  for (const field of ["name", "email", "workRole"]) {
    if (before[field] !== person[field])
      logEvent(data, {
        action: "person.details_updated",
        subjectId: person.id,
        changes: [{ field, from: before[field], to: person[field] }],
        via,
      });
  }
}

function logReferenceChanges(
  data,
  person,
  beforeIds,
  afterIds,
  records,
  type,
  addedAction,
  removedAction,
  via = "profile",
  batchId,
) {
  for (const id of afterIds.filter((value) => !beforeIds.includes(value)))
    logEvent(data, {
      action: addedAction,
      subjectId: person.id,
      target: targetRecord(
        type,
        records.find((item) => item.id === id),
      ),
      changes: [{ field: type, from: null, to: id }],
      ...(batchId ? { batchId } : {}),
      via,
    });
  for (const id of beforeIds.filter((value) => !afterIds.includes(value)))
    logEvent(data, {
      action: removedAction,
      subjectId: person.id,
      target: targetRecord(
        type,
        records.find((item) => item.id === id),
      ),
      changes: [{ field: type, from: id, to: null }],
      ...(batchId ? { batchId } : {}),
      via,
    });
}

// Approving moves a request to "approved"; declining closes it as withdrawn.
function decideRequest(next, personId, enrolmentId, approve) {
  const person = getPerson(next, personId);
  if (!person || person.archivedAt) throw Error("Person not found.");
  const enrolment = next.courseEnrolments.find(
    (item) => item.id === enrolmentId && item.personId === person.id,
  );
  if (!enrolment || enrolment.status !== "requested")
    throw Error("This request has already been dealt with.");
  const course = next.courses.find((item) => item.id === enrolment.courseId);
  enrolment.status = approve ? "approved" : "withdrawn";
  enrolment[approve ? "approvedAt" : "declinedAt"] = isoNow();
  logEvent(next, {
    action: approve ? "training.approved" : "training.declined",
    subjectId: person.id,
    target: targetRecord("course", { id: course.id, name: courseLabel(course) }),
    changes: [{ field: "status", from: "requested", to: enrolment.status }],
    via: "profile",
  });
}

export function createStore({ storage = null, initialData } = {}) {
  let data;
  let migrated = false;
  if (initialData) {
    data = normaliseDatabase(initialData);
  } else if (storage) {
    const current = storage.getItem(STORAGE_KEY);
    const legacy = current ? null : storage.getItem(LEGACY_STORAGE_KEY);
    data = current
      ? normaliseDatabase(JSON.parse(current))
      : legacy
        ? normaliseDatabase(JSON.parse(legacy))
        : seedDatabase();
    migrated = Boolean(legacy);
  } else {
    data = seedDatabase();
  }
  if (storage && migrated) storage.setItem(STORAGE_KEY, JSON.stringify(data));

  const save = (value) => {
    if (!storage) return;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch (cause) {
      throw Object.assign(Error("Changes could not be saved."), {
        code: "storage",
        cause,
      });
    }
  };
  const assertCanManageTeams = (next) => {
    const actor = next.people.find((item) => item.id === next.session.actorId);
    if (!["Admin", "SSO Admin", "Limited Admin"].includes(actor?.portal?.role))
      throw Error("You do not have permission to change teams.");
  };
  const transact = (change) => {
    const next = structuredClone(data);
    const result = change(next);
    validateStoreDatabase(next);
    save(next);
    data = next;
    return result;
  };
  const undos = new Map();
  const findPerson = (next, id) => {
    const person = getPerson(next, id);
    if (!person || person.archivedAt) throw Error("Person not found.");
    return person;
  };
  const addStudentRecords = (
    next,
    inputs,
    { via = "invite", batchId, allowNoVoucher = false } = {},
  ) => {
    const added = [];
    for (const input of inputs) {
      const email = normalEmail(input.email);
      let person = next.people.find((item) => item.email === email);
      if (person?.student && !person.archivedAt)
        throw Error(`${email} is already a student.`);
      if (!person) {
        person = {
          id: uid(),
          name: String(input.name || email.split("@")[0]).trim(),
          email,
          workRole: String(input.workRole || "Student"),
          sansAccount: input.accountSetup ? "awaiting" : "linked",
          createdAt: isoNow(),
          updatedAt: isoNow(),
        };
        next.people.push(person);
      } else if (person.archivedAt) {
        delete person.archivedAt;
      }
      updatePersonDetails(next, person, existingOr(person, input));
      person.student = studentDetailsFrom(next, { ...input, allowNoVoucher });
      const voucher = next.vouchers.find(
        (item) => item.id === person.student.voucherId,
      );
      const waiting = person.student.status === "Needs voucher";
      logEvent(next, {
        action: waiting ? "student.added_needs_voucher" : "student.invited",
        subjectId: person.id,
        target: targetRecord("voucher", voucher),
        changes: [{ field: "student", from: null, to: person.student.status }],
        batchId,
        via,
      });
      added.push(person.id);
    }
    return added;
  };

  const api = {
    snapshot: () => structuredClone(data),
    view: () => legacyView(data),
    getPerson: (id) => structuredClone(getPerson(data, id)),
    listPortalUsers: (filters) =>
      structuredClone(listPortalUsers(data, filters)),
    listStudents: (filters) => structuredClone(listStudents(data, filters)),
    peopleInTeam: (id) => structuredClone(peopleInTeam(data, id)),
    peopleWithTeamAccess: (id) =>
      structuredClone(peopleWithTeamAccess(data, id)),
    invitePortalUser(input) {
      return transact((next) => {
        const email = normalEmail(input.email);
        let person = next.people.find((item) => item.email === email);
        if (person?.portal && !person.archivedAt)
          throw Error("This email is already a portal user.");
        if (!person) {
          person = {
            id: uid(),
            name: String(input.name || "").trim(),
            email,
            workRole: String(input.workRole || ""),
            sansAccount: input.accountSetup ? "awaiting" : "linked",
            createdAt: isoNow(),
            updatedAt: isoNow(),
          };
          next.people.push(person);
        } else if (person.archivedAt) {
          delete person.archivedAt;
        }
        updatePersonDetails(next, person, {
          name: person.student ? person.name : input.name,
          email,
        });
        person.portal = portalAccessFrom(next, input);
        logEvent(next, {
          action: "portal.invited",
          subjectId: person.id,
          changes: [{ field: "role", from: null, to: person.portal.role }],
          via: "invite",
        });
        return person.id;
      });
    },
    addStudent(input) {
      return transact((next) => addStudentRecords(next, [input])[0]);
    },
    addStudents(inputs) {
      return transact((next) =>
        addStudentRecords(next, inputs, {
          batchId: inputs.length > 1 ? uid() : undefined,
        }),
      );
    },
    updatePersonDetails(id, input) {
      return transact((next) => {
        const person = findPerson(next, id);
        const before = structuredClone(person);
        const eventCount = next.events.length;
        updatePersonDetails(next, person, input);
        logDetailChanges(next, person, before);
        if (next.events.length === eventCount)
          logEvent(next, {
            action: "person.details_updated",
            subjectId: person.id,
            changes: [{ field: "details", from: "unchanged", to: "confirmed" }],
            via: "profile",
          });
      });
    },
    editPortalAccess(id, input) {
      return transact((next) => {
        const person = findPerson(next, id);
        if (!person.portal) throw Error("Portal access not found.");
        const beforePerson = structuredClone(person);
        const before = structuredClone(person.portal);
        const eventCount = next.events.length;
        updatePersonDetails(next, person, input);
        person.portal = portalAccessFrom(next, input, person.portal);
        if (person.portal.status === "Active") person.sansAccount = "linked";
        logDetailChanges(next, person, beforePerson);
        if (before.role !== person.portal.role)
          logEvent(next, {
            action: "portal.role_changed",
            subjectId: person.id,
            changes: [
              { field: "role", from: before.role, to: person.portal.role },
            ],
            via: "profile",
          });
        const action = statusAction(
          "portal",
          before.status,
          person.portal.status,
        );
        if (action)
          logEvent(next, {
            action,
            actorId:
              action === "portal.invite_accepted" ? person.id : undefined,
            subjectId: person.id,
            changes: [
              {
                field: "status",
                from: before.status,
                to: person.portal.status,
              },
            ],
            via: "profile",
          });
        if (
          beforePerson.sansAccount === "awaiting" &&
          person.sansAccount === "linked"
        )
          logEvent(next, {
            action: "person.account_created",
            actorId: person.id,
            subjectId: person.id,
            via: "system",
          });
        logReferenceChanges(
          next,
          person,
          before.voucherIds,
          person.portal.voucherIds,
          next.vouchers,
          "voucher",
          "portal.voucher_added",
          "portal.voucher_removed",
        );
        logReferenceChanges(
          next,
          person,
          before.adminGroupIds,
          person.portal.adminGroupIds,
          next.adminGroups,
          "adminGroup",
          "portal.admin_group_added",
          "portal.admin_group_removed",
        );
        logReferenceChanges(
          next,
          person,
          before.teamIds,
          person.portal.teamIds,
          next.teams,
          "team",
          "portal.team_access_added",
          "portal.team_access_removed",
        );
        if (next.events.length === eventCount)
          logEvent(next, {
            action: "person.details_updated",
            subjectId: person.id,
            changes: [{ field: "details", from: "unchanged", to: "confirmed" }],
            via: "profile",
          });
      });
    },
    editStudentDetails(id, input) {
      return transact((next) => {
        const person = findPerson(next, id);
        if (!person.student) throw Error("Student details not found.");
        const beforePerson = structuredClone(person);
        const before = structuredClone(person.student);
        const eventCount = next.events.length;
        updatePersonDetails(next, person, input);
        person.student = studentDetailsFrom(next, input, person.student);
        if (person.student.status === "Active") person.sansAccount = "linked";
        logDetailChanges(next, person, beforePerson);
        if (before.voucherId !== person.student.voucherId) {
          const from = next.vouchers.find(
            (item) => item.id === before.voucherId,
          );
          const to = next.vouchers.find(
            (item) => item.id === person.student.voucherId,
          );
          logEvent(next, {
            action: "student.voucher_changed",
            subjectId: person.id,
            target: targetRecord("voucher", to),
            changes: [{ field: "voucher", from: from?.name, to: to?.name }],
            via: "profile",
          });
        }
        if (before.adminGroupId !== person.student.adminGroupId) {
          const from = next.adminGroups.find(
            (item) => item.id === before.adminGroupId,
          );
          const to = next.adminGroups.find(
            (item) => item.id === person.student.adminGroupId,
          );
          logEvent(next, {
            action: "student.admin_group_changed",
            subjectId: person.id,
            target: targetRecord("adminGroup", to || from),
            changes: [{ field: "adminGroup", from: from?.name, to: to?.name }],
            via: "profile",
          });
        }
        if (before.teamId !== person.student.teamId) {
          const from = next.teams.find((item) => item.id === before.teamId);
          const to = next.teams.find(
            (item) => item.id === person.student.teamId,
          );
          logEvent(next, {
            action: from
              ? to
                ? "student.team_changed"
                : "student.team_removed"
              : "student.team_added",
            subjectId: person.id,
            target: targetRecord("team", to || from),
            changes: [{ field: "team", from: from?.name, to: to?.name }],
            via: "profile",
          });
        }
        if (before.status === "Needs voucher" && person.student.voucherId)
          logEvent(next, {
            action: "student.invite_released",
            subjectId: person.id,
            target: targetRecord(
              "voucher",
              next.vouchers.find((item) => item.id === person.student.voucherId),
            ),
            changes: [
              { field: "status", from: "Needs voucher", to: person.student.status },
            ],
            via: "profile",
          });
        const action = statusAction(
          "student",
          before.status,
          person.student.status,
        );
        if (action)
          logEvent(next, {
            action,
            actorId:
              action === "student.invite_accepted" ? person.id : undefined,
            subjectId: person.id,
            changes: [
              {
                field: "status",
                from: before.status,
                to: person.student.status,
              },
            ],
            via: "profile",
          });
        if (
          beforePerson.sansAccount === "awaiting" &&
          person.sansAccount === "linked"
        )
          logEvent(next, {
            action: "person.account_created",
            actorId: person.id,
            subjectId: person.id,
            via: "system",
          });
        if (next.events.length === eventCount)
          logEvent(next, {
            action: "person.details_updated",
            subjectId: person.id,
            changes: [{ field: "details", from: "unchanged", to: "confirmed" }],
            via: "profile",
          });
      });
    },
    removePortalAccess(id) {
      return transact((next) => {
        const person = findPerson(next, id);
        if (!person.portal) throw Error("Portal access not found.");
        if (person.id === next.session.actorId)
          throw Error(
            "Sign in as another administrator before removing your own portal access.",
          );
        const role = person.portal.role;
        delete person.portal;
        person.updatedAt = isoNow();
        if (!person.student) person.archivedAt = isoNow();
        logEvent(next, {
          action: "portal.revoked",
          subjectId: person.id,
          changes: [{ field: "role", from: role, to: null }],
          via: "profile",
        });
      });
    },
    removeStudent(id) {
      return transact((next) => {
        const person = findPerson(next, id);
        if (!person.student) throw Error("Student details not found.");
        delete person.student;
        person.updatedAt = isoNow();
        if (!person.portal) person.archivedAt = isoNow();
        logEvent(next, {
          action: "student.removed",
          subjectId: person.id,
          changes: [{ field: "student", from: "Student", to: null }],
          via: "profile",
        });
      });
    },
    changeStatus(id, status) {
      return transact((next) => {
        if (!ROLE_STATUSES.includes(status))
          throw Error("Choose a valid status.");
        const person = findPerson(next, id);
        const type = roleFromRowId(id);
        const access = type === "student" ? person.student : person.portal;
        if (!access) throw Error("Role not found.");
        if (access.status === "Needs voucher")
          throw Error("Assign a voucher before changing this student's status.");
        const previousStatus = access.status;
        const previousAccount = person.sansAccount;
        access.status = status;
        delete access.accessLabel;
        person.updatedAt = isoNow();
        if (status === "Active") person.sansAccount = "linked";
        logEvent(next, {
          action:
            statusAction(type, previousStatus, status) ||
            `${type}.${status === "Suspended" ? "suspended" : "reactivated"}`,
          actorId:
            previousStatus === "Pending invite" && status === "Active"
              ? person.id
              : undefined,
          subjectId: person.id,
          changes: [{ field: "status", from: previousStatus, to: status }],
          via: "list",
        });
        if (previousAccount === "awaiting" && person.sansAccount === "linked")
          logEvent(next, {
            action: "person.account_created",
            actorId: person.id,
            subjectId: person.id,
            via: "system",
          });
      });
    },
    resendInvite(id) {
      return transact((next) => {
        const person = findPerson(next, id);
        const type =
          roleFromRowId(id) || (person.portal ? "portal" : "student");
        const access = type === "student" ? person.student : person.portal;
        if (access.status === "Needs voucher")
          throw Error("No invitation has been sent yet. Assign a voucher first.");
        access.invitedAt = isoNow();
        logEvent(next, {
          action: `${type}.invite_resent`,
          subjectId: person.id,
          via: "list",
        });
      });
    },
    bulkStatus(ids, status) {
      return api.bulk("status", ids, { status });
    },
    bulkResend(ids) {
      return api.bulk("resend", ids);
    },
    archivePerson(id) {
      return transact((next) => {
        const person = findPerson(next, id);
        person.archivedAt = isoNow();
        logEvent(next, {
          action: "person.archived",
          subjectId: person.id,
          via: "profile",
        });
      });
    },
    archivePeople(ids) {
      return api.bulk("remove", ids);
    },
    // One entry point for bulk actions (see src/bulk-engine.js). `dryRun` returns
    // the result without saving, so the UI can preview side effects first.
    bulk(kind, ids, params = {}, { dryRun = false } = {}) {
      const helpers = {
        // Admins change anyone. Limited Admins change students in their scope.
        // Viewers change no one. Removing a whole person is Admin-only.
        canEdit: (next, person, role, action) => {
          const actor = next.people.find((item) => item.id === next.session.actorId);
          const allowed = personPermissions(person, actor);
          if (action === "remove") return allowed.canEditDetails;
          return role === "student" ? allowed.canEditStudent : allowed.canEditPortal;
        },
        // A Limited Admin can only put students on a voucher they manage.
        canUseVoucher: (next, voucher) => {
          const actor = next.people.find((item) => item.id === next.session.actorId);
          return actor?.portal?.role !== "Limited Admin" || actor.portal.voucherIds.includes(voucher.id);
        },
        uid,
        isoNow,
        logEvent,
        targetRecord,
        statusAction,
        getPerson,
        roleFromRowId,
        logReferenceChanges,
      };
      if (dryRun) {
        const result = runBulk(structuredClone(data), kind, ids, params, helpers);
        delete result.before;
        return result;
      }
      let result;
      transact((next) => {
        result = runBulk(next, kind, ids, params, helpers);
      });
      // Resent invitations have gone and deleted data is gone, so neither can be undone.
      if (result.applied.length && !["resend", "deletePermanently"].includes(result.kind)) {
        const undoId = uid();
        // Remember how each person looked straight after the action, so undo can
        // leave alone anyone who has been changed again since.
        const after = new Map(
          [...result.before.keys()].map((id) => [id, JSON.stringify(data.people.find((item) => item.id === id))]),
        );
        undos.set(undoId, { label: result.label, before: [...result.before.values()], after });
        result.undoId = undoId;
        // Only the latest few actions can be undone, and only until reload.
        for (const key of [...undos.keys()].slice(0, -5)) undos.delete(key);
      }
      delete result.before;
      return result;
    },
    // Restores the people a bulk action changed. History is never rewritten: the
    // original events stay, and the undo is logged as its own events.
    undo(undoId) {
      const entry = undos.get(undoId);
      if (!entry) throw Error("This action can no longer be undone.");
      const outcome = { restored: 0, skipped: [] };
      transact((next) => {
        const batchId = uid();
        for (const before of entry.before) {
          const index = next.people.findIndex((item) => item.id === before.id);
          if (index < 0) continue;
          if (JSON.stringify(next.people[index]) !== entry.after.get(before.id)) {
            outcome.skipped.push({ id: before.id, name: before.name, reason: "Changed since" });
            continue;
          }
          next.people[index] = structuredClone(before);
          outcome.restored += 1;
          logEvent(next, {
            action: "bulk.undone",
            subjectId: before.id,
            changes: [{ field: "action", from: entry.label, to: "undone" }],
            batchId,
            via: "bulk",
          });
        }
      });
      undos.delete(undoId);
      return outcome;
    },
    saveImportDraft(draft) {
      return transact((next) => {
        if (
          typeof draft?.id !== "string" ||
          typeof draft.fileName !== "string" ||
          !Array.isArray(draft.rows) ||
          draft.rows.length > MAX_DRAFT_ROWS
        )
          throw Error("This import could not be saved.");
        const saved = structuredClone({
          uploadedAt: isoNow(),
          uploadedBy: next.session.actorId,
          ...draft,
        });
        const index = next.importDrafts.findIndex((item) => item.id === saved.id);
        if (index < 0) next.importDrafts.push(saved);
        else next.importDrafts[index] = saved;
        return saved.id;
      });
    },
    discardImportDraft(id) {
      return transact((next) => {
        next.importDrafts = next.importDrafts.filter((item) => item.id !== id);
      });
    },
    createTeam(name, description = "") {
      return transact((next) => {
        const clean = String(name || "").trim();
        if (
          !clean ||
          next.teams.some(
            (team) => team.name.toLowerCase() === clean.toLowerCase(),
          )
        )
          throw Error("Enter a unique team name.");
        const team = {
          id: `${recordId("team", clean)}-${uid().slice(0, 8)}`,
          name: clean,
          description: String(description || "").trim(),
          createdAt: isoNow(),
          createdBy: next.session.actorId || "system",
        };
        next.teams.push(team);
        logEvent(next, {
          action: "team.created",
          target: targetRecord("team", team),
          via: "list",
        });
        return team.id;
      });
    },
    // Rename a team and change its description. Names stay unique.
    updateTeam(id, { name, description } = {}) {
      return transact((next) => {
        const team = next.teams.find((item) => item.id === id);
        if (!team) throw Error("That team no longer exists.");
        assertCanManageTeams(next);
        const clean = String(name ?? team.name).trim();
        if (!clean) throw Error("Enter a team name.");
        if (next.teams.some((item) => item.id !== id && item.name.toLowerCase() === clean.toLowerCase()))
          throw Error("Another team already has that name.");
        const text = String(description ?? team.description ?? "").trim();
        if (clean !== team.name) {
          logEvent(next, {
            action: "team.renamed",
            target: targetRecord("team", { ...team, name: clean }),
            changes: [{ field: "team", from: team.name, to: clean }],
            via: "team",
          });
          team.name = clean;
        }
        if (text !== (team.description || "")) {
          logEvent(next, {
            action: "team.description_changed",
            target: targetRecord("team", team),
            changes: [{ field: "description", from: team.description || "", to: text }],
            via: "team",
          });
          team.description = text;
        }
        team.updatedAt = isoNow();
        team.updatedBy = next.session.actorId;
        return team.id;
      });
    },
    // Delete a team with no members. Portal users lose access to it.
    deleteTeam(id) {
      return transact((next) => {
        const team = next.teams.find((item) => item.id === id);
        if (!team) throw Error("That team no longer exists.");
        assertCanManageTeams(next);
        const members = next.people.filter((p) => !p.archivedAt && p.student?.teamId === id);
        if (members.length) throw Error("Move this team's members before deleting it.");
        const withAccess = next.people.filter((p) => p.portal?.teamIds?.includes(id));
        for (const person of withAccess) person.portal.teamIds = person.portal.teamIds.filter((t) => t !== id);
        next.teams = next.teams.filter((item) => item.id !== id);
        logEvent(next, {
          action: "team.deleted",
          target: targetRecord("team", team),
          changes: withAccess.length ? [{ field: "access", from: `${withAccess.length} portal ${withAccess.length === 1 ? "user" : "users"}`, to: "" }] : [],
          via: "team",
        });
        return withAccess.length;
      });
    },
    commitCsvImport(inputs, { fileName = "CSV import", excluded = 0 } = {}) {
      return transact((next) => {
        const batchId = uid();
        const ids = addStudentRecords(next, inputs, {
          via: "csv",
          batchId,
          allowNoVoucher: true,
        });
        const students = ids.map((id) => getPerson(next, id).student);
        logEvent(next, {
          action: "import.completed",
          changes: [
            { field: "count", from: 0, to: ids.length },
            { field: "file", from: null, to: fileName },
            { field: "invited", from: 0, to: students.filter((item) => item.status !== "Needs voucher").length },
            { field: "needsVoucher", from: 0, to: students.filter((item) => item.status === "Needs voucher").length },
            { field: "excluded", from: 0, to: excluded },
          ],
          batchId,
          via: "csv",
        });
        return {
          ids,
          batchId,
          invited: students.filter((item) => item.status !== "Needs voucher").length,
          needsVoucher: students.filter((item) => item.status === "Needs voucher").length,
        };
      });
    },
    assignCourse(id, { courseId }) {
      return transact((next) => {
        const person = findPerson(next, id);
        if (!person.student) throw Error("Only students can be enrolled in courses.");
        if (person.student.status === "Suspended")
          throw Error("Reactivate this student before assigning a course.");
        if (person.student.status === "Needs voucher")
          throw Error("Assign a voucher before assigning a course.");
        const course = next.courses.find((item) => item.id === courseId);
        if (!course) throw Error("Choose a course.");
        if (
          next.courseEnrolments.some(
            (item) =>
              item.personId === person.id &&
              item.courseId === course.id &&
              CURRENT_STATUSES.includes(item.status),
          )
        )
          throw Error(`${person.name} is already on ${course.code}.`);
        const now = isoNow();
        const enrolment = {
          id: `enrol-${person.id}-${course.code}-${uid().slice(0, 6)}`,
          personId: person.id,
          courseId: course.id,
          status: "in_progress",
          voucherId: person.student.voucherId,
          requestedAt: now,
          startedAt: now,
          endsAt: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString(),
          progress: 0,
        };
        next.courseEnrolments.push(enrolment);
        logEvent(next, {
          action: "training.assigned",
          subjectId: person.id,
          target: targetRecord("course", { id: course.id, name: courseLabel(course) }),
          changes: [
            {
              field: "voucher",
              from: null,
              to: next.vouchers.find((v) => v.id === person.student.voucherId)?.name,
            },
          ],
          via: "profile",
        });
        return enrolment.id;
      });
    },
    withdrawFromCourse(id, enrolmentId) {
      return transact((next) => {
        const person = findPerson(next, id);
        const enrolment = next.courseEnrolments.find(
          (item) => item.id === enrolmentId && item.personId === person.id,
        );
        if (!enrolment) throw Error("Course enrollment not found.");
        if (!CURRENT_STATUSES.includes(enrolment.status))
          throw Error("Only current courses can be withdrawn.");
        const course = next.courses.find((item) => item.id === enrolment.courseId);
        const previous = enrolment.status;
        enrolment.status = "withdrawn";
        enrolment.withdrawnAt = isoNow();
        logEvent(next, {
          action: "training.withdrawn",
          subjectId: person.id,
          target: targetRecord("course", { id: course.id, name: courseLabel(course) }),
          changes: [{ field: "status", from: previous, to: "withdrawn" }],
          via: "profile",
        });
      });
    },
    approveTrainingRequest(id, enrolmentId) {
      return transact((next) => decideRequest(next, id, enrolmentId, true));
    },
    declineTrainingRequest(id, enrolmentId) {
      return transact((next) => decideRequest(next, id, enrolmentId, false));
    },
    setActor(id) {
      return transact((next) => {
        const person = findPerson(next, id);
        if (!person.portal) throw Error("Choose a portal user.");
        next.session.actorId = person.id;
      });
    },
    replaceDatabase(input) {
      const replacement = normaliseDatabase(input);
      save(replacement);
      data = replacement;
    },
    acceptExternalDatabase(input) {
      data = normaliseDatabase(input);
    },
    reset() {
      const replacement = seedDatabase();
      save(replacement);
      data = replacement;
    },
  };
  return api;
}
