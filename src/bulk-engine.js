// Bulk actions on people, shared by the CSV review, Students and Portal users
// tables. Pure: works on a database copy handed in by the store, which supplies
// the helpers (logging, id lookups). Every action returns the same result shape:
//   { kind, label, batchId, applied, unchanged, skipped, cleared, invitesReleased, before }
// where each list holds { id, personId, name } and `skipped` also carries a reason.

export const PORTAL_BULK_ROLES = ["Admin", "Limited Admin", "Viewer"];
const ACCESS_KEYS = {
  voucher: "voucherIds",
  adminGroup: "adminGroupIds",
  team: "teamIds",
};
const FIELD_NAMES = {
  voucher: "voucher",
  adminGroup: "admin group",
  team: "team",
};

const sameSet = (a, b) =>
  a.length === b.length && a.every((value) => b.includes(value));
const unique = (list) => [...new Set(list)];

function lookup(records, name, label) {
  const record = records.find(
    (item) => item.name.toLowerCase() === String(name || "").toLowerCase(),
  );
  if (!record) throw Error(`Choose a valid ${label}.`);
  return record;
}

function coveredGroups(next, voucherIds) {
  return unique(
    voucherIds.flatMap(
      (id) => next.vouchers.find((voucher) => voucher.id === id)?.adminGroupIds || [],
    ),
  );
}

const nameOf = (records, id) => records.find((item) => item.id === id)?.name;

// The organisation must always keep at least one active Admin.
const ADMIN_ROLES = ["Admin", "SSO Admin"];
function isActiveAdmin(person) {
  return Boolean(person.portal) && !person.archivedAt && person.portal.status === "Active" && ADMIN_ROLES.includes(person.portal.role);
}
function isLastActiveAdmin(next, person) {
  return isActiveAdmin(person) && !next.people.some((other) => other.id !== person.id && isActiveAdmin(other));
}

// One handler per kind. `role` is the role the action works on; "row" means the
// row id decides (status, resend and remove work on whichever table you are in).
const HANDLERS = {
  voucher: {
    role: "student",
    label: ({ params }) => `assigning voucher ${params.voucher}`,
    prepare: ({ next, params }) => ({
      voucher: lookup(next.vouchers, params.voucher, "voucher"),
    }),
    apply({ next, h, batchId, result }, person, _role, { voucher }) {
      const student = person.student;
      if (!student) return { skip: "Not a student" };
      if (h.canUseVoucher && !h.canUseVoucher(next, voucher))
        return { skip: `You do not manage ${voucher.name}` };
      if (student.voucherId === voucher.id) return { unchanged: true };
      const before = structuredClone(student);
      const previous = next.vouchers.find((item) => item.id === before.voucherId);
      student.voucherId = voucher.id;
      person.updatedAt = h.isoNow();
      h.logEvent(next, {
        action: "student.voucher_changed",
        subjectId: person.id,
        target: h.targetRecord("voucher", voucher),
        changes: [{ field: "voucher", from: previous?.name, to: voucher.name }],
        batchId,
        via: "bulk",
      });
      if (student.adminGroupId && !voucher.adminGroupIds.includes(student.adminGroupId)) {
        const group = next.adminGroups.find((item) => item.id === student.adminGroupId);
        delete student.adminGroupId;
        result.cleared.push({ personId: person.id, name: person.name, field: "admin group", value: group?.name });
        h.logEvent(next, {
          action: "student.admin_group_changed",
          subjectId: person.id,
          target: h.targetRecord("adminGroup", group),
          changes: [{ field: "adminGroup", from: group?.name, to: null }],
          batchId,
          via: "bulk",
        });
      }
      if (before.status === "Needs voucher") {
        student.status = "Pending invite";
        student.invitedAt = h.isoNow();
        result.invitesReleased += 1;
        h.logEvent(next, {
          action: "student.invite_released",
          subjectId: person.id,
          target: h.targetRecord("voucher", voucher),
          changes: [{ field: "status", from: "Needs voucher", to: "Pending invite" }],
          batchId,
          via: "bulk",
        });
      }
      return {};
    },
  },

  adminGroup: {
    role: "student",
    label: ({ params }) => `assigning admin group ${params.group}`,
    prepare: ({ next, params }) => ({
      group: lookup(next.adminGroups, params.group, "admin group"),
    }),
    apply({ next, h, batchId }, person, _role, { group }) {
      const student = person.student;
      if (!student) return { skip: "Not a student" };
      if (!student.voucherId) return { skip: "Needs a voucher before an admin group can be assigned" };
      if (student.adminGroupId === group.id) return { unchanged: true };
      const voucher = next.vouchers.find((item) => item.id === student.voucherId);
      if (!voucher.adminGroupIds.includes(group.id))
        return { skip: `${group.name} is not covered by ${voucher.name}` };
      const previous = next.adminGroups.find((item) => item.id === student.adminGroupId);
      student.adminGroupId = group.id;
      person.updatedAt = h.isoNow();
      h.logEvent(next, {
        action: "student.admin_group_changed",
        subjectId: person.id,
        target: h.targetRecord("adminGroup", group),
        changes: [{ field: "adminGroup", from: previous?.name, to: group.name }],
        batchId,
        via: "bulk",
      });
      return {};
    },
  },

  team: {
    role: "student",
    label: ({ params }) => (params.team ? `adding to team ${params.team}` : "removing from their team"),
    prepare: ({ next, params }) => ({
      team: params.team ? lookup(next.teams, params.team, "team") : null,
    }),
    apply({ next, h, batchId }, person, _role, { team }) {
      const student = person.student;
      if (!student) return { skip: "Not a student" };
      if ((student.teamId || null) === (team?.id || null)) return { unchanged: true };
      const previous = next.teams.find((item) => item.id === student.teamId);
      if (team) student.teamId = team.id;
      else delete student.teamId;
      person.updatedAt = h.isoNow();
      h.logEvent(next, {
        action: previous ? (team ? "student.team_changed" : "student.team_removed") : "student.team_added",
        subjectId: person.id,
        target: h.targetRecord("team", team || previous),
        changes: [{ field: "team", from: previous?.name, to: team?.name }],
        batchId,
        via: "bulk",
      });
      return {};
    },
  },

  status: {
    role: "row",
    label: ({ params }) => (params.status === "Suspended" ? "suspending" : params.status === "Active" ? "reactivating" : `setting the status to ${params.status}`),
    prepare: ({ params }) => {
      if (!["Pending invite", "Active", "Suspended"].includes(params.status))
        throw Error("Choose a valid status.");
      return {};
    },
    apply({ next, h, batchId, params }, person, role) {
      const access = role === "student" ? person.student : person.portal;
      if (!access) return { skip: role === "student" ? "Not a student" : "Not a portal user" };
      if (access.status === "Needs voucher") return { skip: "Needs a voucher first" };
      if (access.status === params.status) return { unchanged: true };
      if (role === "portal" && params.status === "Suspended") {
        if (person.id === next.session.actorId) return { skip: "You cannot suspend yourself" };
        if (isLastActiveAdmin(next, person)) return { skip: "The organisation needs at least one active Admin" };
      }
      const previous = access.status;
      const previousAccount = person.sansAccount;
      access.status = params.status;
      delete access.accessLabel;
      person.updatedAt = h.isoNow();
      if (params.status === "Active") person.sansAccount = "linked";
      h.logEvent(next, {
        action: h.statusAction(role, previous, params.status) || `${role}.${params.status === "Suspended" ? "suspended" : "reactivated"}`,
        actorId: previous === "Pending invite" && params.status === "Active" ? person.id : undefined,
        subjectId: person.id,
        changes: [{ field: "status", from: previous, to: params.status }],
        batchId,
        via: "bulk",
      });
      if (previousAccount === "awaiting" && person.sansAccount === "linked")
        h.logEvent(next, { action: "person.account_created", actorId: person.id, subjectId: person.id, batchId, via: "system" });
      return {};
    },
  },

  resend: {
    role: "row",
    label: () => "resending invitations",
    apply({ next, h, batchId }, person, role) {
      const access = role === "student" ? person.student : person.portal;
      if (!access) return { skip: role === "student" ? "Not a student" : "Not a portal user" };
      if (access.status === "Needs voucher") return { skip: "No invitation has been sent yet" };
      if (access.status !== "Pending invite") return { skip: "Only pending invitations can be resent" };
      access.invitedAt = h.isoNow();
      h.logEvent(next, { action: `${role}.invite_resent`, subjectId: person.id, batchId, via: "bulk" });
      return {};
    },
  },

  remove: {
    role: "row",
    once: true,
    label: () => "removing from the organisation",
    apply({ next, h, batchId }, person) {
      if (person.id === next.session.actorId)
        return { skip: "You cannot remove yourself" };
      if (isLastActiveAdmin(next, person))
        return { skip: "The organisation needs at least one active Admin" };
      person.archivedAt = h.isoNow();
      h.logEvent(next, { action: "person.archived", subjectId: person.id, batchId, via: "bulk" });
      return {};
    },
  },

  // Removes only the student role. The person is archived only if they hold no other role.
  removeStudent: {
    role: "student",
    label: () => "removing as a student",
    apply({ next, h, batchId }, person) {
      if (!person.student) return { skip: "Not a student" };
      delete person.student;
      person.updatedAt = h.isoNow();
      if (!person.portal) person.archivedAt = h.isoNow();
      h.logEvent(next, {
        action: "student.removed",
        subjectId: person.id,
        changes: [{ field: "student", from: "Student", to: null }],
        batchId,
        via: "bulk",
      });
      return {};
    },
  },

  // Erasure. The person, their training records and certifications are deleted.
  // Activity history stays (it is a record of what the organisation did), but
  // everything that identifies them is replaced with "Deleted user". Cannot be undone.
  deletePermanently: {
    role: "row",
    once: true,
    label: () => "permanently deleting",
    apply({ next, h, batchId }, person) {
      if (person.id === next.session.actorId)
        return { skip: "You cannot delete yourself" };
      if (isLastActiveAdmin(next, person))
        return { skip: "The organisation needs at least one active Admin" };
      const alias = `deleted-${h.uid().slice(0, 8)}`;
      const identifiers = [person.name, person.email].filter(Boolean);
      const scrub = (value) =>
        typeof value === "string" && identifiers.some((text) => value.toLowerCase().includes(text.toLowerCase()))
          ? "Removed"
          : value;
      for (const event of next.events) {
        // Earlier names and emails survive only inside "details updated" events: blank them all.
        if (event.subjectId === person.id && event.action === "person.details_updated")
          event.changes = (event.changes || []).map((change) => ({ ...change, from: change.from == null ? change.from : "Removed", to: change.to == null ? change.to : "Removed" }));
        if (event.actorId === person.id) Object.assign(event, { actorId: alias, actorName: "Deleted user" });
        if (event.subjectId === person.id) Object.assign(event, { subjectId: alias, subjectName: "Deleted user" });
        if (event.changes)
          event.changes = event.changes.map((change) => ({ ...change, from: scrub(change.from), to: scrub(change.to) }));
        if (event.legacyMessage) {
          let message = event.legacyMessage;
          for (const text of identifiers) message = message.split(text).join("Deleted user");
          event.legacyMessage = message;
        }
      }
      next.courseEnrolments = next.courseEnrolments.filter((item) => item.personId !== person.id);
      next.certifications = next.certifications.filter((item) => item.personId !== person.id);
      for (const draft of next.importDrafts)
        draft.rows = draft.rows.filter((row) => String(row.email || "").toLowerCase() !== person.email);
      for (const other of next.people)
        for (const role of [other.portal, other.student])
          if (role?.invitedBy === person.id) role.invitedBy = "deleted";
      for (const team of next.teams) if (team.createdBy === person.id) team.createdBy = "deleted";
      next.people = next.people.filter((item) => item.id !== person.id);
      h.logEvent(next, { action: "person.deleted", subjectId: alias, subjectName: "Deleted user", batchId, via: "bulk" });
      return {};
    },
  },

  removePortal: {
    role: "portal",
    label: () => "removing portal access",
    apply({ next, h, batchId }, person) {
      if (!person.portal) return { skip: "Not a portal user" };
      if (person.id === next.session.actorId)
        return { skip: "You cannot remove your own portal access" };
      if (isLastActiveAdmin(next, person))
        return { skip: "The organisation needs at least one active Admin" };
      const role = person.portal.role;
      delete person.portal;
      person.updatedAt = h.isoNow();
      if (!person.student) person.archivedAt = h.isoNow();
      h.logEvent(next, {
        action: "portal.revoked",
        subjectId: person.id,
        changes: [{ field: "role", from: role, to: null }],
        batchId,
        via: "bulk",
      });
      return {};
    },
  },

  portalAccess: {
    role: "portal",
    label: ({ params }) =>
      `${{ add: "adding", remove: "removing", replace: "replacing" }[params.mode]} ${FIELD_NAMES[params.field]} access`,
    prepare: ({ next, params }) => {
      if (!ACCESS_KEYS[params.field]) throw Error("Choose what to change.");
      if (!["add", "remove", "replace"].includes(params.mode)) throw Error("Choose add, remove or replace.");
      if (!params.names?.length) throw Error(`Choose at least one ${FIELD_NAMES[params.field]}.`);
      const records = { voucher: next.vouchers, adminGroup: next.adminGroups, team: next.teams }[params.field];
      return { ids: unique(params.names.map((name) => lookup(records, name, FIELD_NAMES[params.field]).id)) };
    },
    apply({ next, h, batchId, params, result }, person, _role, { ids }) {
      const access = person.portal;
      if (!access) return { skip: "Not a portal user" };
      const key = ACCESS_KEYS[params.field];
      const before = structuredClone(access);
      const current = access[key];
      const wanted =
        params.mode === "add" ? unique([...current, ...ids])
        : params.mode === "remove" ? current.filter((id) => !ids.includes(id))
        : ids;
      if (sameSet(current, wanted)) return { unchanged: true };
      const proposed = { ...access, [key]: wanted };

      if (params.field === "voucher") {
        if (access.role === "Limited Admin" && wanted.length > 1)
          return { skip: "A Limited Admin can only have one voucher" };
        if (!wanted.length) return { skip: "Needs at least one voucher" };
        const covered = coveredGroups(next, wanted);
        proposed.adminGroupIds = access.adminGroupIds.filter((id) => covered.includes(id));
        if (!proposed.adminGroupIds.length) return { skip: "No admin group would be left under the new vouchers" };
        for (const id of access.adminGroupIds.filter((value) => !covered.includes(value)))
          result.cleared.push({ personId: person.id, name: person.name, field: "admin group", value: nameOf(next.adminGroups, id) });
      }
      if (params.field === "adminGroup") {
        const covered = coveredGroups(next, access.voucherIds);
        const outside = wanted.filter((id) => !covered.includes(id) && !current.includes(id));
        if (outside.length)
          return { skip: `${nameOf(next.adminGroups, outside[0])} is not covered by their vouchers` };
        if (!wanted.length) return { skip: "Needs at least one admin group" };
      }
      Object.assign(access, proposed);
      person.updatedAt = h.isoNow();
      logPortalDiff(next, h, person, before, access, batchId);
      return {};
    },
  },

  role: {
    role: "portal",
    label: ({ params }) => `changing role to ${params.role}`,
    prepare: ({ params }) => {
      if (!PORTAL_BULK_ROLES.includes(params.role)) throw Error("Choose a role.");
      return {};
    },
    apply({ next, h, batchId, params, result }, person) {
      const access = person.portal;
      if (!access) return { skip: "Not a portal user" };
      if (access.role === params.role) return { unchanged: true };
      if (person.id === next.session.actorId) return { skip: "You cannot change your own role" };
      if (ADMIN_ROLES.includes(access.role) && !ADMIN_ROLES.includes(params.role) && isLastActiveAdmin(next, person))
        return { skip: "The organisation needs at least one active Admin" };
      const before = structuredClone(access);
      const proposed = { ...access, role: params.role };
      if (params.role === "Limited Admin" && access.voucherIds.length > 1) {
        proposed.voucherIds = [access.voucherIds[0]];
        const covered = coveredGroups(next, proposed.voucherIds);
        proposed.adminGroupIds = access.adminGroupIds.filter((id) => covered.includes(id));
        if (!proposed.adminGroupIds.length)
          return { skip: "No admin group would be left with a single voucher" };
        for (const id of access.voucherIds.slice(1))
          result.cleared.push({ personId: person.id, name: person.name, field: "voucher", value: nameOf(next.vouchers, id) });
        for (const id of access.adminGroupIds.filter((value) => !covered.includes(value)))
          result.cleared.push({ personId: person.id, name: person.name, field: "admin group", value: nameOf(next.adminGroups, id) });
      }
      Object.assign(access, proposed);
      person.updatedAt = h.isoNow();
      logPortalDiff(next, h, person, before, access, batchId);
      return {};
    },
  },
};

function logPortalDiff(next, h, person, before, after, batchId) {
  if (before.role !== after.role)
    h.logEvent(next, {
      action: "portal.role_changed",
      subjectId: person.id,
      changes: [{ field: "role", from: before.role, to: after.role }],
      batchId,
      via: "bulk",
    });
  h.logReferenceChanges(next, person, before.voucherIds, after.voucherIds, next.vouchers, "voucher", "portal.voucher_added", "portal.voucher_removed", "bulk", batchId);
  h.logReferenceChanges(next, person, before.adminGroupIds, after.adminGroupIds, next.adminGroups, "adminGroup", "portal.admin_group_added", "portal.admin_group_removed", "bulk", batchId);
  h.logReferenceChanges(next, person, before.teamIds, after.teamIds, next.teams, "team", "portal.team_access_added", "portal.team_access_removed", "bulk", batchId);
}

export function runBulk(next, kind, ids, params, h) {
  const handler = HANDLERS[kind];
  if (!handler) throw Error(`Unknown bulk action: ${kind}.`);
  const batchId = h.uid();
  const result = {
    kind,
    batchId,
    label: handler.label({ params }),
    applied: [],
    unchanged: [],
    skipped: [],
    cleared: [],
    invitesReleased: 0,
    before: new Map(),
  };
  const prepared = handler.prepare ? handler.prepare({ next, params }) : {};
  const context = { next, h, batchId, params, result };
  const done = new Set();
  for (const id of unique(ids)) {
    // Actions on the whole person run once even if both of their rows are selected.
    if (handler.once) {
      const personKey = String(id).replace(/--(portal|student)$/, "");
      if (done.has(personKey)) continue;
      done.add(personKey);
    }
    const person = h.getPerson(next, id);
    const entry = { id, personId: person?.id, name: person?.name || "Unknown person" };
    if (!person || person.archivedAt) {
      result.skipped.push({ ...entry, reason: "Person not found" });
      continue;
    }
    const role =
      handler.role === "row"
        ? h.roleFromRowId(id) || (person.portal ? "portal" : "student")
        : handler.role;
    if (h.canEdit && !h.canEdit(next, person, role, kind)) {
      result.skipped.push({ ...entry, reason: "You do not have access to change this person" });
      continue;
    }
    const hadBefore = result.before.has(person.id);
    if (!hadBefore) result.before.set(person.id, structuredClone(person));
    const outcome = handler.apply(context, person, role, prepared) || {};
    if (outcome.skip) result.skipped.push({ ...entry, reason: outcome.skip });
    else if (outcome.unchanged) result.unchanged.push(entry);
    else result.applied.push(entry);
    // Only people who changed need restoring on undo.
    if (!hadBefore && (outcome.skip || outcome.unchanged)) result.before.delete(person.id);
  }
  // Skipped people were never changed, so their "cleared" notes do not apply.
  const skippedIds = new Set(result.skipped.map((item) => item.personId));
  result.cleared = result.cleared.filter((item) => !skippedIds.has(item.personId));
  return result;
}
