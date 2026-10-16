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
  if (!id || ["system", "sans"].includes(id)) return label;
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
      return `${actor} updated ${subjectPossessive} ${escapeHtml(item?.field || "details")} from ${escapeHtml(item?.from)} to ${escapeHtml(item?.to)}`;
    }
    case "person.account_created":
      return `${subject} created their SANS account`;
    case "person.archived":
      return `${actor} removed ${subject} from the organisation`;
    case "training.requested":
      return `${subject} requested ${target(event)}`;
    case "training.approved":
      return `${actor} approved ${subjectPossessive} request for ${target(event)}`;
    case "training.declined":
      return `${actor} declined ${subjectPossessive} request for ${target(event)}`;
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
