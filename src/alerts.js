// Alerts are worked out from the data whenever a profile or list is shown; they
// are never stored. Pure functions, so they can be unit-tested without a browser.
import { certificationStatus, courseLabel } from "./training.js";

export const PENDING_INVITE_DAYS = 5;
export const AWAITING_ACCOUNT_DAYS = 7;
const ALERT_DAY = 24 * 60 * 60 * 1000;
const SEVERITY_ORDER = { error: 0, action: 1, warning: 2, info: 3 };
export const SEVERITY_LABELS = {
  error: "Error",
  action: "Action Needed",
  warning: "Warning",
  info: "Info",
};

const daysSince = (iso, now) => Math.floor((now.getTime() - Date.parse(iso)) / ALERT_DAY);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const shortDate = (iso) =>
  new Date(iso).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

// What the signed-in person (the actor) may do to this person's record.
export function personPermissions(person, actor) {
  const role = actor?.portal?.role;
  const full = role === "Admin" || role === "SSO Admin";
  const limited = role === "Limited Admin";
  const student = person?.student;
  const studentInScope = Boolean(
    limited &&
      student &&
      actor.portal.voucherIds.includes(student.voucherId) &&
      (!student.adminGroupId ||
        actor.portal.adminGroupIds.includes(student.adminGroupId)),
  );
  return {
    canEditDetails: full,
    canEditPortal: full,
    canEditStudent: full || studentInScope,
    // A student waiting for a voucher cannot be enrolled on a course yet.
    canManageTraining:
      Boolean(student) && student.status !== "Needs voucher" && (full || studentInScope),
    canAddPortal: full,
    canAddStudent: full,
  };
}

// Returns alerts sorted by severity. An alert only carries an `action` when the
// viewer is allowed to take it.
export function alertsFor(person, data, viewer, { now = new Date(), noTeam = false } = {}) {
  if (!person || person.archivedAt) return [];
  const can = personPermissions(person, viewer);
  const alerts = [];
  const add = (alert) => alerts.push(alert);
  const voucherName = (id) => data.vouchers.find((v) => v.id === id)?.name || "their voucher";
  const roleRow = (type) => `${person.id}--${type}`;

  for (const item of data.courseEnrolments.filter(
    (e) => e.personId === person.id && e.status === "requested",
  )) {
    const course = data.courses.find((c) => c.id === item.courseId);
    add({
      id: `request-${item.id}`,
      key: "training-request",
      severity: "action",
      title: `Training request awaiting approval: ${course.code}`,
      detail: `Requested ${shortDate(item.requestedAt)} · paid by ${voucherName(item.voucherId)}`,
      action: can.canManageTraining
        ? { type: "review-request", label: "Review", enrolmentId: item.id }
        : undefined,
    });
  }

  let invitePending = false;
  for (const type of ["portal", "student"]) {
    const access = person[type];
    if (!access) continue;
    if (access.status === "Pending invite") {
      const days = daysSince(access.invitedAt, now);
      if (days > PENDING_INVITE_DAYS) {
        invitePending = true;
        add({
          id: `invite-${type}`,
          key: "invite-pending",
          severity: "warning",
          title: `${type === "portal" ? "Portal" : "Student"} invitation pending for ${plural(days, "day")}`,
          detail: "They have not accepted the invitation yet.",
          action: (type === "portal" ? can.canEditPortal : can.canEditStudent)
            ? { type: "resend", label: "Resend Invitation", rowId: roleRow(type) }
            : undefined,
        });
      }
    }
    if (access.status === "Suspended") {
      add({
        id: `suspended-${type}`,
        key: "suspended",
        severity: "info",
        title: `${type === "portal" ? "Portal Access" : "Student Access"} suspended`,
        detail: "They cannot use this role until it is reactivated.",
        action: (type === "portal" ? can.canEditPortal : can.canEditStudent)
          ? { type: "reactivate", label: "Reactivate", rowId: roleRow(type) }
          : undefined,
      });
    }
  }

  if (person.student?.status === "Needs voucher")
    add({
      id: "needs-voucher",
      key: "needs-voucher",
      severity: "action",
      title: "Needs a voucher before they can be invited",
      detail: "No invitation has been sent yet. Assigning a voucher sends it.",
      action: can.canEditStudent
        ? { type: "assign-voucher", label: "Assign Voucher" }
        : undefined,
    });

  if (person.sansAccount === "awaiting" && !invitePending) {
    const invited = [person.portal, person.student]
      .filter(Boolean)
      .map((access) => Date.parse(access.invitedAt));
    const days = Math.floor((now.getTime() - Math.max(...invited)) / ALERT_DAY);
    if (days > AWAITING_ACCOUNT_DAYS) {
      const type = person.portal ? "portal" : "student";
      add({
        id: "awaiting-account",
        key: "awaiting-account",
        severity: "warning",
        title: `Awaiting SANS account for ${plural(days, "day")}`,
        detail: "They have not created their SANS account yet.",
        action: (type === "portal" ? can.canEditPortal : can.canEditStudent)
          ? { type: "resend", label: "Resend Invitation", rowId: roleRow(type) }
          : undefined,
      });
    }
  }

  const certs = data.certifications.filter((c) => c.personId === person.id);
  for (const cert of certs) {
    const status = certificationStatus(cert, now);
    if (status.key === "valid") continue;
    // A newer valid certification of the same kind replaces an expired one.
    if (certs.some((other) => other.id !== cert.id && other.code === cert.code && certificationStatus(other, now).key !== "expired")) continue;
    add({
      id: `cert-${cert.id}`,
      key: status.key === "expired" ? "cert-expired" : "cert-expiring",
      severity: status.key === "expired" ? "error" : "warning",
      title:
        status.key === "expired"
          ? `${cert.code} certification expired on ${shortDate(cert.expiresAt)}`
          : `${cert.code} certification expires in ${plural(status.days, "day")}`,
      detail: cert.name,
      action: { type: "view-training", label: "View" },
    });
  }

  for (const item of data.courseEnrolments.filter(
    (e) => e.personId === person.id && e.status === "in_progress" && e.endsAt && Date.parse(e.endsAt) < now.getTime(),
  )) {
    const course = data.courses.find((c) => c.id === item.courseId);
    add({
      id: `overdue-${item.id}`,
      key: "course-overdue",
      severity: "warning",
      title: `${course.code} end date passed on ${shortDate(item.endsAt)}`,
      detail: `${courseLabel(course)} is not completed (${item.progress}%).`,
      action: { type: "view-training", label: "View" },
    });
  }

  if (noTeam && person.student && !person.student.teamId) {
    add({
      id: "no-team",
      key: "no-team",
      severity: "info",
      title: "Student Has No Team",
      detail: "Assign a team so reporting groups them correctly.",
      action: can.canEditStudent ? { type: "assign-team", label: "Assign Team" } : undefined,
    });
  }

  return alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

// Alert counts for every person, for the badge in the lists.
export function alertCounts(data, viewer, options) {
  const counts = new Map();
  for (const person of data.people) {
    const total = alertsFor(person, data, viewer, options).length;
    if (total) counts.set(person.id, total);
  }
  return counts;
}
