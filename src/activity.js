const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );

const person = (id, name) => {
  const label = escapeHtml(name || "Unknown person");
  if (!id || ["system", "sans"].includes(id) || String(id).startsWith("deleted")) return label;
  return `<button type="button" class="button-link activity-person" data-action="open-event-person" data-person-id="${escapeHtml(id)}">${label}</button>`;
};

const change = (event, field) =>
  event.changes?.find((item) => item.field === field);
const value = (event, field, side) => change(event, field)?.[side];
const target = (event) => escapeHtml(event.target?.name || "the item");
const possessive = (name) =>
  `${name}${String(name).endsWith("s") ? "’" : "’s"}`;

export function describeEvent(event) {
  const actor = person(event.actorId, event.actorName);
  const subject = person(event.subjectId, event.subjectName);
  const subjectPossessive = possessive(subject);
  const from = escapeHtml(
    value(event, "role", "from") ??
      value(event, "voucher", "from") ??
      value(event, "adminGroup", "from") ??
      value(event, "team", "from") ??
      "",
  );
  const to = escapeHtml(
    value(event, "role", "to") ??
      value(event, "voucher", "to") ??
      value(event, "adminGroup", "to") ??
      value(event, "team", "to") ??
      "",
  );
  switch (event.action) {
    case "portal.invited":
      return `${actor} invited ${subject} as ${escapeHtml(value(event, "role", "to") || "a portal user")}`;
    case "portal.invite_resent":
      return `${actor} resent ${subjectPossessive} portal invitation`;
    case "portal.invite_accepted":
      return `${subject} accepted their portal invitation`;
    case "portal.role_changed":
      return `${actor} changed ${subjectPossessive} role from ${from} to ${to}`;
    case "portal.voucher_added":
      return `${actor} gave ${subject} access to voucher ${target(event)}`;
    case "portal.voucher_removed":
      return `${actor} removed ${subjectPossessive} access to voucher ${target(event)}`;
    case "portal.admin_group_added":
      return `${actor} gave ${subject} access to admin group ${target(event)}`;
    case "portal.admin_group_removed":
      return `${actor} removed ${subjectPossessive} access to admin group ${target(event)}`;
    case "portal.team_access_added":
      return `${actor} gave ${subject} access to team ${target(event)}`;
    case "portal.team_access_removed":
      return `${actor} removed ${subjectPossessive} access to team ${target(event)}`;
    case "portal.suspended":
      return `${actor} suspended ${subjectPossessive} portal access`;
    case "portal.reactivated":
      return `${actor} reactivated ${subjectPossessive} portal access`;
    case "portal.revoked":
      return `${actor} removed ${subjectPossessive} portal access`;
    case "student.invited":
      return `${actor} added ${subject} as a student on ${target(event)}`;
    case "student.added_needs_voucher":
      return `${actor} added ${subject} as a student, waiting for a voucher`;
    case "student.invite_released":
      return `${actor} sent ${subjectPossessive} student invitation after assigning a voucher`;
    case "bulk.undone":
      return `${actor} undid ${escapeHtml(change(event, "action")?.from || "a bulk action")} for ${subject}`;
    case "student.invite_resent":
      return `${actor} resent ${subjectPossessive} student invitation`;
    case "student.invite_accepted":
      return `${subject} accepted their student invitation`;
    case "student.voucher_changed":
      return `${actor} moved ${subject} from voucher ${from} to ${to}`;
    case "student.admin_group_changed":
      return to
        ? `${actor} moved ${subject} to admin group ${to}`
        : `${actor} removed ${subject} from admin group ${from}`;
    case "student.team_added":
      return `${actor} added ${subject} to team ${target(event)}`;
    case "student.team_removed":
      return `${actor} removed ${subject} from team ${target(event)}`;
    case "student.team_changed":
      return `${actor} moved ${subject} from team ${from} to ${to}`;
    case "student.suspended":
      return `${actor} suspended ${subjectPossessive} student access`;
    case "student.reactivated":
      return `${actor} reactivated ${subjectPossessive} student access`;
    case "student.removed":
      return `${actor} removed ${subject} as a student`;
    case "person.details_updated": {
      const item = event.changes?.[0];
      const field = escapeHtml(
        { workRole: "work role" }[item?.field] || item?.field || "details",
      );
      const previous = escapeHtml(item?.from);
      const next = escapeHtml(item?.to);
      if (item?.from == null || item?.from === "")
        return `${actor} set ${subjectPossessive} ${field} to ${next}`;
      if (item?.to == null || item?.to === "")
        return `${actor} cleared ${subjectPossessive} ${field}`;
      return `${actor} updated ${subjectPossessive} ${field} from ${previous} to ${next}`;
    }
    case "person.account_created":
      return `${subject} created their SANS account`;
    case "person.deleted":
      return `${actor} permanently deleted a person and their data`;
    case "person.archived":
      return `${actor} removed ${subject} from the organisation`;
    case "training.requested":
      return `${subject} requested ${target(event)}`;
    case "training.approved":
      return `${actor} approved ${subjectPossessive} request for ${target(event)}`;
    case "training.declined":
      return `${actor} declined ${subjectPossessive} request for ${target(event)}`;
    case "training.withdrawn":
      return `${actor} withdrew ${subject} from ${target(event)}`;
    case "training.assigned":
      return `${actor} enrolled ${subject} on ${target(event)}`;
    case "training.completed":
      return `${subject} completed ${target(event)}`;
    case "certification.earned":
      return `${subject} earned ${target(event)}`;
    case "certification.expiring":
      return `${subjectPossessive} ${target(event)} expires on ${escapeHtml(value(event, "expiresAt", "to") || "the recorded date")}`;
    case "team.created":
      return `${actor} created team ${target(event)}`;
    case "team.renamed":
      return `${actor} renamed team ${from} to ${to}`;
    case "team.description_changed":
      return `${actor} changed the description of team ${target(event)}`;
    case "team.deleted":
      return `${actor} deleted team ${target(event)}`;
    case "import.completed":
      return `${actor} imported ${escapeHtml(value(event, "count", "to") || 0)} students from ${escapeHtml(value(event, "file", "to") || "CSV")}`;
    case "legacy.note":
      return escapeHtml(event.legacyMessage || "Legacy activity");
    default:
      return `${actor} updated ${subject || target(event)}`;
  }
}

export function eventsFor(events, personId, { to = true, by = true } = {}) {
  return events.filter(
    (event) =>
      (to && event.subjectId === personId) ||
      (by && event.actorId === personId),
  );
}

// ---------- Display helpers for the profile activity card ----------
const startOfDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

export function dayLabel(iso, now = new Date()) {
  const date = new Date(iso);
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function timeLabel(iso) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Newest first, grouped by calendar day.
export function groupEventsByDay(events, now = new Date()) {
  const groups = [];
  for (const event of events) {
    const label = dayLabel(event.at, now);
    const last = groups.at(-1);
    if (last?.label === label) last.events.push(event);
    else groups.push({ label, events: [event] });
  }
  return groups;
}

const VIA_LABELS = { csv: "CSV import", bulk: "bulk action" };

export function viaLabel(event) {
  return VIA_LABELS[event.via] || "";
}

// "Part of CSV import (5 people)" for events that share a batch.
export function batchSummary(events, event) {
  const label = viaLabel(event);
  if (!label) return "";
  const kind = event.via === "csv" ? "CSV import" : "a bulk action";
  if (!event.batchId) return `Part of ${kind}`;
  const people = new Set(
    events
      .filter((item) => item.batchId === event.batchId && item.subjectId)
      .map((item) => item.subjectId),
  );
  return people.size > 1
    ? `Part of ${kind} (${people.size} people)`
    : `Part of ${kind}`;
}

const FIELD_LABELS = {
  adminGroup: "Admin group",
  workRole: "Work role",
  student: "Student status",
  portal: "Portal status",
};

export function describeChange(item) {
  const field =
    FIELD_LABELS[item.field] ||
    String(item.field).charAt(0).toUpperCase() +
      String(item.field).slice(1).replace(/([A-Z])/g, " $1").toLowerCase();
  const show = (value) =>
    value === null || value === undefined || value === ""
      ? "Not set"
      : escapeHtml(Array.isArray(value) ? value.join(", ") : value);
  return { field: escapeHtml(field), from: show(item.from), to: show(item.to) };
}

// ---------- Global activity log ----------
export const ACTION_CATEGORIES = [
  { key: "portal", label: "Portal access", prefixes: ["portal."] },
  { key: "student", label: "Students", prefixes: ["student."] },
  { key: "person", label: "People", prefixes: ["person."] },
  { key: "training", label: "Training", prefixes: ["training.", "certification."] },
  { key: "team", label: "Teams", prefixes: ["team."] },
  { key: "import", label: "Imports", prefixes: ["import."] },
];

export function actionCategory(action) {
  return (
    ACTION_CATEGORIES.find((item) =>
      item.prefixes.some((prefix) => String(action).startsWith(prefix)),
    )?.key || "other"
  );
}

const vouchersOf = (person) => [
  ...(person?.student ? [person.student.voucherId] : []),
  ...(person?.portal?.voucherIds || []),
];
const adminGroupsOf = (person) => [
  ...(person?.student?.adminGroupId ? [person.student.adminGroupId] : []),
  ...(person?.portal?.adminGroupIds || []),
];

// Default for open question 1: Admins see everything. Limited Admins and Viewers
// see events about people who share one of their vouchers, plus their own actions.
export function visibleEvents(events, data, viewer) {
  const role = viewer?.portal?.role;
  if (role === "Admin" || role === "SSO Admin") return events;
  if (!viewer?.portal) return [];
  const mine = new Set(viewer.portal.voucherIds);
  const people = new Map(data.people.map((person) => [person.id, person]));
  return events.filter(
    (event) =>
      event.actorId === viewer.id ||
      (event.subjectId &&
        vouchersOf(people.get(event.subjectId)).some((id) => mine.has(id))),
  );
}

// Filters: personId (actor or subject), category, from/to (YYYY-MM-DD, inclusive),
// adminGroupId and voucherId (the subject's current records, or the event's target).
export function filterEvents(events, data, filters = {}) {
  const people = new Map(data.people.map((person) => [person.id, person]));
  const from = filters.from ? new Date(`${filters.from}T00:00:00`).getTime() : null;
  const to = filters.to ? new Date(`${filters.to}T23:59:59.999`).getTime() : null;
  return events.filter((event) => {
    if (
      filters.personId &&
      event.subjectId !== filters.personId &&
      event.actorId !== filters.personId
    )
      return false;
    if (filters.category && actionCategory(event.action) !== filters.category)
      return false;
    const at = Date.parse(event.at);
    if (from !== null && at < from) return false;
    if (to !== null && at > to) return false;
    const subject = people.get(event.subjectId);
    if (
      filters.voucherId &&
      !vouchersOf(subject).includes(filters.voucherId) &&
      !(event.target?.type === "voucher" && event.target.id === filters.voucherId)
    )
      return false;
    if (
      filters.adminGroupId &&
      !adminGroupsOf(subject).includes(filters.adminGroupId) &&
      !(event.target?.type === "adminGroup" && event.target.id === filters.adminGroupId)
    )
      return false;
    return true;
  });
}

// Events that share a batchId (a CSV import or bulk action) become one entry,
// placed where the newest of them sits. A batch of one stays a plain event.
export function groupBatches(events) {
  const entries = [];
  const batches = new Map();
  for (const event of events) {
    if (!event.batchId) {
      entries.push({ type: "event", event });
      continue;
    }
    let entry = batches.get(event.batchId);
    if (!entry) {
      entry = { type: "batch", batchId: event.batchId, events: [] };
      batches.set(event.batchId, entry);
      entries.push(entry);
    }
    entry.events.push(event);
  }
  return entries.map((entry) =>
    entry.type === "batch" && entry.events.length < 2
      ? { type: "event", event: entry.events[0] }
      : entry,
  );
}

const BATCH_VERBS = [
  [/\.suspended$/, "suspended"],
  [/\.reactivated$/, "reactivated"],
  [/\.invite_resent$/, "resent invitations to"],
  [/\.(removed|revoked)$|^person\.archived$/, "removed"],
  [/\.invited$/, "invited"],
  [/\.added_needs_voucher$/, "added"],
  [/\.invite_released$/, "sent invitations to"],
  [/^bulk\.undone$/, "undid changes for"],
  [/\.voucher_changed$/, "assigned a voucher to"],
  [/\.admin_group_changed$/, "changed the admin group of"],
  [/\.team_(added|changed|removed)$/, "changed the team of"],
];

// One sentence for a whole batch, for example "Ada Whitfield suspended 3 people".
export function batchHeadline(batch) {
  const summary = batch.events.find((event) => event.action === "import.completed");
  if (summary) return describeEvent(summary);
  const first = batch.events[0];
  const people = new Set(batch.events.map((event) => event.subjectId).filter(Boolean));
  const verb =
    BATCH_VERBS.find(([pattern]) => pattern.test(first.action))?.[1] || "updated";
  const count = people.size || batch.events.length;
  return `${person(first.actorId, first.actorName)} ${verb} ${count} ${count === 1 ? "person" : "people"}`;
}

export function plainText(html) {
  return String(html ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

// Cells that start with = + - or @ would run as formulas in a spreadsheet.
function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function eventsToCsv(events) {
  const header = ["time_utc", "actor", "subject", "action", "description", "target", "changes", "via", "batch_id"];
  const rows = events.map((event) => [
    event.at,
    event.actorName,
    event.subjectName || "",
    event.action,
    plainText(describeEvent(event)),
    event.target?.name || "",
    (event.changes || [])
      .map((item) => `${item.field}: ${item.from ?? "not set"} -> ${item.to ?? "not set"}`)
      .join("; "),
    event.via || "",
    event.batchId || "",
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}
