// Full person profile. This layer intentionally loads after tables.js and
// replaces its placeholder while keeping table-to-profile navigation intact.

function profileRecordName(records, id, fallback = "Unassigned") {
  return records.find((record) => record.id === id)?.name || fallback;
}

function profileContext() {
  const snapshot = store.snapshot();
  const person = store.getPerson(state.profileId);
  const actor = snapshot.people.find(
    (candidate) => candidate.id === snapshot.session.actorId,
  );
  return { snapshot, person, actor };
}

function profilePermissions(person, actor) {
  return personPermissions(person, actor);
}

function profileRoleChip(label, status) {
  return `<span class="profile-role-chip"><strong>${esc(label)}</strong>${labelStatus(status)}</span>`;
}

function profileDetailRows(rows) {
  return `<dl class="profile-detail-list">${rows
    .map(
      ([label, value]) =>
        `<div><dt>${esc(label)}</dt><dd>${esc(value || "Unassigned")}</dd></div>`,
    )
    .join("")}</dl>`;
}

function profileSectionHead(title, action = "", id = "") {
  return `<div class="profile-card-head"><h2${id ? ` id="${id}"` : ""}>${esc(title)}</h2>${action}</div>`;
}

// ---------- Needs attention ----------
const ALERT_ICONS = { error: "error", action: "schedule", warning: "error", info: "info" };

function profileAlertsCard(person, snapshot, actor) {
  const alerts = alertsFor(person, snapshot, actor);
  if (!alerts.length) return "";
  return `<section class="card profile-alerts" aria-labelledby="profile-alerts-title"><div class="profile-card-head"><h2 id="profile-alerts-title">Needs attention</h2><span class="alert-count">${alerts.length}</span></div><ul>${alerts
    .map((alert) => {
      const action = alert.action
        ? btn(esc(alert.action.label), "profile-alert", "small", `data-type="${esc(alert.action.type)}"${alert.action.rowId ? ` data-row="${esc(alert.action.rowId)}"` : ""}${alert.action.enrolmentId ? ` data-enrolment="${esc(alert.action.enrolmentId)}"` : ""}`)
        : "";
      return `<li class="alert-row alert-${alert.severity}"><span class="alert-icon" aria-hidden="true">${icon(ALERT_ICONS[alert.severity])}</span><div class="alert-body"><strong><span class="alert-level">${esc(SEVERITY_LABELS[alert.severity])}:</span> ${esc(alert.title)}</strong><span>${esc(alert.detail)}</span></div>${action}</li>`;
    })
    .join("")}</ul></section>`;
}

function openProfileReview(enrolmentId) {
  const { snapshot, person } = profileContext();
  const item = snapshot.courseEnrolments.find((entry) => entry.id === enrolmentId && entry.status === "requested");
  if (!person || !item) return;
  const course = trainingCourse(snapshot, item);
  state.modal = "profile-review";
  openModal(
    "Review training request",
    person.name,
    `<dl class="profile-detail-list"><div><dt>Course</dt><dd>${esc(courseLabel(course))}</dd></div><div><dt>Requested</dt><dd>${esc(trainingDate(item.requestedAt))}</dd></div><div><dt>Paid by voucher</dt><dd>${esc(profileRecordName(snapshot.vouchers, item.voucherId))}</dd></div></dl><p class="hint">Approving lets ${esc(person.name.split(/\s+/)[0])} start the course. Declining closes the request.</p>`,
    `<div class="actions">${btn("Cancel", "close-modal", "text")}${btn("Decline", "profile-request-decline", "danger", `data-id="${esc(enrolmentId)}"`)}${btn("Approve", "profile-request-approve", "primary", `data-id="${esc(enrolmentId)}"`)}</div>`,
    "",
    true,
  );
}

// Alert counts for the lists, rebuilt whenever the data or the signed-in user changes.
var alertCache;
function alertCountFor(personId) {
  // `alertCache` is still undefined during the first render, which runs before this file finishes loading.
  if (!alertCache || alertCache.db !== db) {
    const snapshot = store.snapshot();
    const actor = snapshot.people.find((p) => p.id === snapshot.session.actorId);
    alertCache = { db, counts: alertCounts(snapshot, actor) };
  }
  return alertCache.counts.get(personId) || 0;
}
function alertBadge(row) {
  const count = alertCountFor(row.personId);
  if (!count) return "";
  const label = `${count} ${count === 1 ? "item needs" : "items need"} attention`;
  return `<span class="alert-badge" title="${label}" aria-label="${label}">${icon("error")}${count}</span>`;
}

// ---------- Training card ----------
const trainingDate = (iso) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const trainingMonth = (iso) =>
  new Date(iso).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
const ENROLMENT_LABELS = {
  requested: "Awaiting approval",
  approved: "Approved, not started",
  in_progress: "In progress",
};

function trainingCourse(snapshot, item) {
  return snapshot.courses.find((course) => course.id === item.courseId);
}

function profileTrainingCurrent(snapshot, item) {
  const course = trainingCourse(snapshot, item);
  const started = item.status === "in_progress";
  return `<li class="training-current"><div class="training-main"><strong>${esc(course.code)}</strong><span>${esc(course.title)}</span></div><div class="training-meta"><span class="training-chip ${started ? "active" : "neutral"}">${ENROLMENT_LABELS[item.status]}</span>${started ? `<span class="training-progress"><span class="training-bar" role="progressbar" aria-label="${esc(course.code)} progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${item.progress}"><span style="width:${item.progress}%"></span></span>${item.progress}%</span><span class="training-date">Ends ${esc(trainingDate(item.endsAt))}</span>` : `<span class="training-date">Requested ${esc(trainingDate(item.requestedAt))}</span>`}</div></li>`;
}

function profileTrainingCompleted(snapshot, item) {
  const course = trainingCourse(snapshot, item);
  const voucher = profileRecordName(snapshot.vouchers, item.voucherId);
  return `<details class="training-done"><summary><span class="training-main"><strong>${esc(course.code)}</strong><span>${esc(course.title)}</span></span><span class="training-date">${esc(trainingMonth(item.completedAt))} · ${item.score}%</span>${icon("chevron")}</summary><dl><div><dt>Started</dt><dd>${esc(trainingDate(item.startedAt))}</dd></div><div><dt>Completed</dt><dd>${esc(trainingDate(item.completedAt))}</dd></div><div><dt>Final score</dt><dd>${item.score}%</dd></div><div><dt>Paid by voucher</dt><dd>${esc(voucher)}</dd></div></dl></details>`;
}

function profileTrainingCard(person, snapshot, permissions) {
  const manage = permissions.canManageTraining
    ? btn(icon("edit") + "Manage training", "profile-manage-training", "small")
    : "";
  if (!person.student)
    return `<section class="card profile-training">${profileSectionHead("Training")}<div class="profile-empty">${icon("school")}<h3>Not a student</h3><p>Training is recorded for students only.</p></div></section>`;
  const mine = snapshot.courseEnrolments
    .filter((item) => item.personId === person.id)
    .sort((a, b) => Date.parse(b.completedAt || b.startedAt || b.requestedAt) - Date.parse(a.completedAt || a.startedAt || a.requestedAt));
  const current = mine.filter((item) => CURRENT_STATUSES.includes(item.status));
  const done = mine.filter((item) => item.status === "completed");
  const certs = snapshot.certifications
    .filter((item) => item.personId === person.id)
    .sort((a, b) => Date.parse(b.issuedAt) - Date.parse(a.issuedAt));
  const none = (text) => `<p class="training-none">${text}</p>`;
  return `<section class="card profile-training" id="profile-training" aria-labelledby="profile-training-title"><div class="profile-card-head"><h2 id="profile-training-title">Training</h2>${manage}</div>
    <div class="training-block"><h3>Current</h3>${current.length ? `<ul>${current.map((item) => profileTrainingCurrent(snapshot, item)).join("")}</ul>` : none("No current courses.")}</div>
    <div class="training-block"><h3>Completed</h3>${done.length ? done.map((item) => profileTrainingCompleted(snapshot, item)).join("") : none("No completed courses yet.")}</div>
    <div class="training-block"><h3>Certifications</h3>${certs.length ? `<ul>${certs.map((item) => { const status = certificationStatus(item); return `<li class="training-cert"><div class="training-main"><strong>${esc(item.code)}</strong><span>${esc(item.name)}</span></div><div class="training-meta"><span class="training-chip ${status.key}">${status.label}</span><span class="training-date">${status.key === "expired" ? "Expired" : "Valid to"} ${esc(trainingDate(item.expiresAt))}</span></div></li>`; }).join("")}</ul>` : none("No certifications yet.")}</div></section>`;
}

function openProfileTraining() {
  const { snapshot, person } = profileContext();
  if (!person?.student) return;
  const current = snapshot.courseEnrolments.filter(
    (item) => item.personId === person.id && CURRENT_STATUSES.includes(item.status),
  );
  const taken = new Set(current.map((item) => item.courseId));
  const available = snapshot.courses.filter((course) => !taken.has(course.id));
  const voucher = profileRecordName(snapshot.vouchers, person.student.voucherId);
  state.modal = "profile-training";
  openModal(
    "Manage training",
    person.name,
    `<form id="profile-training-form"><div class="field"><label for="profile-training-course">Assign a course</label><select id="profile-training-course" name="course" required><option value="">Choose a course</option>${available.map((course) => `<option value="${esc(course.id)}">${esc(courseLabel(course))}</option>`).join("")}</select><p class="hint">Paid for by ${esc(voucher)}, this student’s voucher.</p></div><p class="inline-error" id="profile-training-error" role="alert"></p></form><section class="field-section"><label>Current courses</label>${current.length ? `<ul class="training-manage-list">${current.map((item) => `<li><span class="training-main"><strong>${esc(trainingCourse(snapshot, item).code)}</strong><span>${esc(ENROLMENT_LABELS[item.status])}</span></span>${btn("Withdraw", "profile-training-withdraw", "small danger", `data-id="${esc(item.id)}"`)}</li>`).join("")}</ul>` : '<p class="training-none">No current courses to withdraw from.</p>'}</section>`,
    `<div class="actions">${btn("Close", "close-modal", "text")}<button class="button primary" type="submit" form="profile-training-form"${available.length ? "" : " disabled"}>Assign course</button></div>`,
  );
}

function openProfileTrainingWithdraw(enrolmentId) {
  const { snapshot, person } = profileContext();
  const item = snapshot.courseEnrolments.find((entry) => entry.id === enrolmentId);
  if (!person || !item) return;
  const course = trainingCourse(snapshot, item);
  state.modal = "profile-confirm-withdraw";
  openModal(
    `Withdraw from ${course.code}?`,
    person.name,
    `<p>${esc(person.name)} will be withdrawn from ${esc(courseLabel(course))}. Their progress so far is kept in the activity log, and you can assign the course again later.</p>`,
    `<div class="actions">${btn("Keep course", "profile-manage-training")} ${btn("Withdraw", "profile-training-withdraw-confirm", "danger", `data-id="${esc(enrolmentId)}"`)}</div>`,
    "",
    true,
  );
}

// ---------- Activity card ----------
const ACTIVITY_PAGE = 20;
const ACTIVITY_KEY = "sans-profile-activity-filter";
function loadActivityFilter() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(ACTIVITY_KEY));
    if (saved && (saved.to || saved.by)) return { to: !!saved.to, by: !!saved.by };
  } catch {}
  return { to: true, by: true };
}
function saveActivityFilter() {
  try {
    sessionStorage.setItem(
      ACTIVITY_KEY,
      JSON.stringify({ to: state.activity.to, by: state.activity.by }),
    );
  } catch {}
}
function activityState(personId) {
  if (!state.activity) state.activity = { ...loadActivityFilter(), personId };
  if (state.activity.personId !== personId)
    Object.assign(state.activity, { personId, shown: 5, open: [] });
  state.activity.shown ||= 5;
  state.activity.open ||= [];
  return state.activity;
}

// One activity entry. Shared by the profile card and the global Activity page;
// `action` is the data-action of its expand button.
function activityEntryHtml(event, all, open, action = "profile-activity-toggle") {
  const via = viaLabel(event);
  const batch = batchSummary(all, event);
  const changes = event.changes?.length
    ? `<dl>${event.changes
        .map((item) => {
          const c = describeChange(item);
          return `<div><dt>${c.field}</dt><dd><span class="activity-from">${c.from}</span>${icon("arrow")}<span>${c.to}</span></dd></div>`;
        })
        .join("")}</dl>`
    : '<p class="activity-none">No before and after values were recorded.</p>';
  return `<li class="activity-entry${open ? " open" : ""}" data-event-id="${esc(event.id)}"><div class="activity-line"><time datetime="${esc(event.at)}">${esc(timeLabel(event.at))}</time><p class="activity-text">${describeEvent(event)}${via ? ` <span class="activity-via">via ${esc(via)}</span>` : ""}</p><button type="button" class="activity-expand" data-action="${action}" data-id="${esc(event.id)}" aria-expanded="${open}" aria-controls="activity-${esc(event.id)}" aria-label="${open ? "Hide" : "Show"} details">${icon("chevron")}</button></div><div class="activity-details" id="activity-${esc(event.id)}"${open ? "" : " hidden"}>${changes}${batch ? `<p class="activity-batch">${esc(batch)}</p>` : ""}</div></li>`;
}
function profileActivityEntry(event, all, open) {
  return activityEntryHtml(event, all, open);
}

function profileActivityCard(person, events) {
  const filter = activityState(person.id);
  const first = esc((person.name || person.email).split(/\s+/)[0]);
  const matching = eventsFor(events, person.id, filter);
  const visible = matching.slice(0, filter.shown);
  const remaining = matching.length - visible.length;
  const toggle = (key, label) => {
    const lastOn = filter[key] && !(key === "to" ? filter.by : filter.to);
    return `<button type="button" class="activity-toggle" data-action="profile-activity-${key}" aria-pressed="${filter[key]}"${lastOn ? ' aria-disabled="true" title="At least one filter must stay on"' : ""}><span class="activity-tick">${filter[key] ? icon("check") : ""}</span>${label}</button>`;
  };
  const body = visible.length
    ? groupEventsByDay(visible)
        .map(
          (group) =>
            `<section class="activity-day"><h3>${esc(group.label)}</h3><ul aria-label="Activity on ${esc(group.label)}">${group.events.map((event) => profileActivityEntry(event, events, filter.open.includes(event.id))).join("")}</ul></section>`,
        )
        .join("")
    : `<div class="profile-empty activity-empty">${icon("schedule")}<h3>No activity yet</h3><p>Changes made to or by ${first} will appear here.</p></div>`;
  return `<section class="card profile-activity" aria-labelledby="profile-activity-title"><div class="profile-card-head"><h2 id="profile-activity-title">Activity</h2><div class="activity-filter" role="group" aria-label="Show activity"><span class="activity-filter-label">Show</span>${toggle("to", `Done to ${first}`)}${toggle("by", `Done by ${first}`)}</div></div><p class="sr-only" role="status">Showing ${visible.length} of ${matching.length} ${matching.length === 1 ? "event" : "events"}</p>${body}${remaining > 0 ? `<div class="activity-more">${btn(`Show more (${remaining})`, "profile-activity-more", "small")}</div>` : ""}</section>`;
}

profileView = function () {
  const { snapshot, person, actor } = profileContext();
  const from = state.profileFrom === "students" ? "students" : "portal";
  if (!person || person.archivedAt)
    return `<button class="back" data-action="navigate" data-view="${from}">${icon("back")}Back</button>${heading("Person not found", "This record may have been removed.")}`;

  const permissions = profilePermissions(person, actor);
  const portal = person.portal;
  const student = person.student;
  const activeRow =
    db.users.find(
      (row) => row.personId === person.id && row.type === "portal",
    ) || db.users.find((row) => row.personId === person.id);
  const portalAction = permissions.canEditPortal
    ? btn(icon("edit") + "Edit", "profile-edit-portal", "small")
    : "";
  const studentAction = permissions.canEditStudent
    ? btn(icon("edit") + "Edit", "profile-edit-student", "small")
    : "";

  const roleChips = [
    portal ? profileRoleChip(portal.role, portal.status) : "",
    student ? profileRoleChip("Student", student.status) : "",
  ].join("");
  const account =
    person.sansAccount === "linked" ? "Linked" : "Awaiting account";

  const portalCard = portal
    ? `<section class="card profile-access-card" aria-labelledby="profile-portal-title">${profileSectionHead("Admin access", portalAction, "profile-portal-title")}${profileDetailRows(
        [
          ["Role", portal.role],
          [
            "Voucher access",
            portal.voucherIds
              .map((id) => profileRecordName(snapshot.vouchers, id))
              .join(", "),
          ],
          [
            "Admin groups",
            portal.adminGroupIds
              .map((id) => profileRecordName(snapshot.adminGroups, id))
              .join(", "),
          ],
          [
            "Team access",
            portal.teamIds
              .map((id) => profileRecordName(snapshot.teams, id))
              .join(", ") || "None",
          ],
        ],
      )}${!permissions.canEditPortal && actor?.portal?.role === "Limited Admin" ? '<p class="profile-readonly">Admin access is read-only for Limited Admins.</p>' : ""}</section>`
    : `<section class="card profile-access-card profile-empty-card" aria-labelledby="profile-portal-title">${profileSectionHead("Admin access", "", "profile-portal-title")}<div class="profile-empty">${icon("person")}<h3>No portal access</h3><p>This person cannot sign in to the enterprise portal.</p>${permissions.canAddPortal && activeRow ? btn("Invite as portal user", "invite-as-portal", "primary", `data-id="${esc(activeRow.id)}"`) : ""}</div></section>`;

  const studentCard = student
    ? `<section class="card profile-access-card" aria-labelledby="profile-student-title">${profileSectionHead("Student details", studentAction, "profile-student-title")}${profileDetailRows(
        [
          ["Voucher", profileRecordName(snapshot.vouchers, student.voucherId)],
          [
            "Admin group",
            profileRecordName(snapshot.adminGroups, student.adminGroupId),
          ],
          ["Team", profileRecordName(snapshot.teams, student.teamId)],
        ],
      )}${student.status === "Needs voucher" ? '<p class="profile-readonly">Invitation on hold until a voucher is assigned.</p>' : ""}${!permissions.canEditStudent && actor?.portal?.role === "Limited Admin" ? '<p class="profile-readonly">This student is outside your assigned scope.</p>' : ""}</section>`
    : `<section class="card profile-access-card profile-empty-card" aria-labelledby="profile-student-title">${profileSectionHead("Student details", "", "profile-student-title")}<div class="profile-empty">${icon("school")}<h3>Not a student</h3><p>No training voucher or student assignments are attached.</p>${permissions.canAddStudent && activeRow ? btn("Add as student", "add-as-student", "primary", `data-id="${esc(activeRow.id)}"`) : ""}</div></section>`;

  return `<button class="back" data-action="navigate" data-view="${from}">${icon("back")}Back to ${from === "portal" ? "Portal users" : "Students"}</button>
  <section class="profile-summary" aria-labelledby="profile-name">
    <div class="profile-identity"><span class="profile-avatar">${esc(initial(person.name || person.email))}</span><div><h1 id="profile-name" tabindex="-1">${esc(person.name || person.email)}</h1><p>${esc(person.workRole || "Work role not set")}</p><a href="mailto:${esc(person.email)}">${esc(person.email)}</a></div></div>
    <div class="profile-summary-side"><div class="profile-role-list" aria-label="Access roles and statuses">${roleChips}</div><div class="profile-account">${icon(person.sansAccount === "linked" ? "check_circle" : "schedule")}<span><small>SANS account</small><strong>${esc(account)}</strong></span></div>${permissions.canEditDetails ? btn(icon("edit") + "Edit details", "profile-edit-details") : ""}${permissions.canEditDetails || permissions.canEditStudent ? btn(icon("trash") + "Remove…", "profile-remove-person", "danger") : ""}</div>
  </section>
  ${profileAlertsCard(person, snapshot, actor)}
  <div class="profile-access-grid">${portalCard}${studentCard}</div>
  ${profileTrainingCard(person, snapshot, permissions)}
  ${profileActivityCard(person, snapshot.events)}`;
};

function openProfileDetails() {
  const { person } = profileContext();
  if (!person) return;
  state.modal = "profile-details";
  openModal(
    "Edit details",
    "Update the details shared across this person’s roles.",
    `<form id="profile-details-form"><div class="form-grid"><div class="field"><label for="profile-name-input">Full name <span class="required">*</span></label><input id="profile-name-input" name="name" required value="${esc(person.name)}"></div><div class="field"><label for="profile-email-input">Email address <span class="required">*</span></label><input id="profile-email-input" name="email" type="email" required value="${esc(person.email)}"></div><div class="field profile-span"><label for="profile-work-input">Work role</label><input id="profile-work-input" name="workRole" value="${esc(person.workRole)}"></div></div><p class="inline-error" id="profile-details-error" role="alert"></p></form>`,
    `<div class="actions">${btn("Cancel", "close-modal", "text")}<button class="button primary" type="submit" form="profile-details-form">Save details</button></div>`,
  );
}

function profilePortalGroupChecks(vouchers, selected) {
  const available = groupsForVouchers(vouchers, db.groups);
  return available.length
    ? choices("groups", available, selected)
    : `<div class="scope-empty">${icon("info")}Choose a voucher to see its admin groups.</div>`;
}

function openProfilePortal() {
  const { snapshot, person } = profileContext();
  if (!person?.portal) return;
  const row = db.users.find(
    (candidate) =>
      candidate.personId === person.id && candidate.type === "portal",
  );
  state.modal = "profile-portal";
  openModal(
    "Edit admin access",
    "Choose the role and areas this person can manage or view.",
    `<form id="profile-portal-form"><div class="form-grid"><div class="field"><label for="profile-portal-role">Role</label><select id="profile-portal-role" name="role">${opts(person.portal.role === "SSO Admin" ? [...ROLES, "SSO Admin"] : ROLES, person.portal.role)}</select></div><div class="field"><label for="profile-portal-status">Status</label><select id="profile-portal-status" name="status">${opts(["Active", "Pending invite", "Suspended"], person.portal.status)}</select></div></div><section class="field-section"><label>Voucher access <span class="required">*</span></label><p class="hint">Choose vouchers first. Available admin groups update to match.</p>${choices(
      "vouchers",
      snapshot.vouchers.map((record) => record.name),
      row.vouchers,
    )}</section><section class="field-section"><label>Admin groups <span class="required">*</span></label><div id="profile-portal-groups">${profilePortalGroupChecks(row.vouchers, row.groups)}</div></section><section class="field-section"><label>Team access</label>${choices(
      "teams",
      snapshot.teams.map((record) => record.name),
      row.teams,
    )}</section><p class="inline-error" id="profile-portal-error" role="alert"></p></form>`,
    `${btn(icon("trash") + "Remove portal access", "profile-remove-portal", "danger")}<div class="actions">${btn("Cancel", "close-modal", "text")}<button class="button primary" type="submit" form="profile-portal-form">Save access</button></div>`,
  );
}

function openProfileStudent() {
  const { snapshot, person } = profileContext();
  if (!person?.student) return;
  const student = person.student;
  const voucher = profileRecordName(snapshot.vouchers, student.voucherId, "");
  const group = profileRecordName(
    snapshot.adminGroups,
    student.adminGroupId,
    "",
  );
  const team = profileRecordName(snapshot.teams, student.teamId, "");
  state.modal = "profile-student";
  openModal(
    "Edit student details",
    "Choose how this person’s training is funded and organised.",
    `<form id="profile-student-form"><div class="form-grid"><div class="field"><label for="profile-student-voucher">Voucher <span class="required">*</span></label><select id="profile-student-voucher" name="voucher" required>${opts(
      snapshot.vouchers.map((record) => record.name),
      voucher,
    )}</select><p class="hint">Pays for their training.</p></div><div class="field"><label for="profile-student-status">Status</label><select id="profile-student-status" name="status">${opts(["Active", "Pending invite", "Suspended"], student.status)}</select></div><div class="field"><label for="profile-student-group">Admin group</label><select id="profile-student-group" name="group">${groupOptions(voucher, group)}</select><p class="hint">Optional · filtered by voucher.</p></div><div class="field"><label for="profile-student-team">Team</label><select id="profile-student-team" name="team">${opts(
      snapshot.teams.map((record) => record.name),
      team,
      "Leave unassigned",
    )}</select><p class="hint">Optional · makes this student a team member.</p></div></div><p class="inline-error" id="profile-student-error" role="alert"></p></form>`,
    `${btn(icon("trash") + "Remove as student", "profile-remove-student", "danger")}<div class="actions">${btn("Cancel", "close-modal", "text")}<button class="button primary" type="submit" form="profile-student-form">Save details</button></div>`,
  );
}

function openProfileRemove(kind) {
  const { person } = profileContext();
  if (!person) return;
  const portal = kind === "portal";
  state.modal = `profile-confirm-remove-${kind}`;
  openModal(
    portal ? "Remove portal access?" : "Remove as student?",
    person.name,
    `<p>This removes ${portal ? "the person’s ability to sign in and their assigned admin scope" : "their voucher, admin group and team assignments"}. Their activity history will be kept.</p>`,
    `<div class="actions">${btn("Keep role", portal ? "profile-edit-portal" : "profile-edit-student")} ${btn(portal ? "Remove portal access" : "Remove as student", `profile-confirm-remove-${kind}`, "danger")}</div>`,
    "",
    true,
  );
}

// Move focus into a profile modal: the first field if it has a form, otherwise
// the safest button (never a destructive one). On close, focus returns to the
// button that opened it, because the page behind the dialog is re-rendered.
function focusProfileModal() {
  const modal = $("#modal");
  const target =
    modal.querySelector(".modal-body input:not([type=hidden]), .modal-body select, .modal-body textarea") ||
    modal.querySelector(".modal-footer .button.text") ||
    modal.querySelector(".modal-footer .button:not(.danger)");
  target?.focus();
}
const profileBaseOpenModal = openModal;
openModal = function (...args) {
  const result = profileBaseOpenModal(...args);
  if (String(state.modal).startsWith("profile-")) focusProfileModal();
  return result;
};
var profileOpener = null;
$("#modal").addEventListener("close", () => {
  // Swapping one profile modal for another also fires "close"; keep focus where it is.
  if ($("#modal").open) return;
  const opener = profileOpener;
  profileOpener = null;
  if (!opener) return;
  const selector = `#main [data-action="${opener.action}"]${opener.id ? `[data-id="${opener.id}"]` : ""}`;
  (document.querySelector(selector) || document.querySelector("#main h1"))?.focus?.();
});

function closeProfileModal() {
  $("#modal").close();
  state.modal = null;
  state.editing = null;
}

function activityRefocus(selector) {
  render();
  document.querySelector(selector)?.focus();
}
function toggleActivityEntry(id) {
  const open = state.activity.open;
  const index = open.indexOf(id);
  if (index < 0) open.push(id);
  else open.splice(index, 1);
  activityRefocus(`.activity-expand[data-id="${id}"]`);
}
document.addEventListener("click", (event) => {
  const entry = event.target.closest(".activity-entry");
  if (
    entry &&
    !event.target.closest("a,button,input,select,textarea") &&
    state.view === "profile" &&
    state.activity
  ) {
    toggleActivityEntry(entry.dataset.eventId);
    return;
  }
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  if (!action.startsWith("profile-")) return;
  event.preventDefault();
  const modalWasOpen = $("#modal").open;
  try {
    if (action === "profile-activity-to" || action === "profile-activity-by") {
      const key = action.endsWith("-to") ? "to" : "by";
      const other = key === "to" ? "by" : "to";
      if (state.activity[key] && !state.activity[other]) return;
      state.activity[key] = !state.activity[key];
      state.activity.shown = 5;
      saveActivityFilter();
      activityRefocus(`[data-action="${action}"]`);
    }
    if (action === "profile-activity-more") {
      state.activity.shown += ACTIVITY_PAGE;
      activityRefocus('[data-action="profile-activity-more"]');
    }
    if (action === "profile-activity-toggle")
      toggleActivityEntry(target.dataset.id);
    if (action === "profile-alert") {
      const { type, row, enrolment } = target.dataset;
      if (type === "review-request") openProfileReview(enrolment);
      if (type === "resend")
        dispatch((nextStore) => nextStore.resendInvite(row), "Invitation resent in this demo");
      if (type === "reactivate")
        dispatch((nextStore) => nextStore.changeStatus(row, "Active"), "Access reactivated");
      if (type === "assign-team" || type === "assign-voucher") openProfileStudent();
      if (type === "view-training")
        $("#profile-training")?.scrollIntoView({
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
          block: "start",
        });
    }
    if (action === "profile-request-approve" || action === "profile-request-decline") {
      const { person } = profileContext();
      const approve = action === "profile-request-approve";
      if (
        dispatch(
          (nextStore) =>
            approve
              ? nextStore.approveTrainingRequest(person.id, target.dataset.id)
              : nextStore.declineTrainingRequest(person.id, target.dataset.id),
          approve ? "Request approved" : "Request declined",
        )
      )
        closeProfileModal();
    }
    if (action === "profile-remove-person") openRemoveDialog([state.profileId]);
    if (action === "profile-manage-training") openProfileTraining();
    if (action === "profile-training-withdraw")
      openProfileTrainingWithdraw(target.dataset.id);
    if (action === "profile-training-withdraw-confirm") {
      const { person } = profileContext();
      if (
        dispatch(
          (nextStore) => nextStore.withdrawFromCourse(person.id, target.dataset.id),
          "Course withdrawn",
        )
      )
        closeProfileModal();
    }
    if (action === "profile-edit-details") openProfileDetails();
    if (action === "profile-edit-portal") openProfilePortal();
    if (action === "profile-edit-student") openProfileStudent();
    if (action === "profile-remove-portal") openProfileRemove("portal");
    if (action === "profile-remove-student") openProfileRemove("student");
    if (action === "profile-confirm-remove-portal") {
      const { person } = profileContext();
      if (
        dispatch(
          (nextStore) => nextStore.removePortalAccess(person.id),
          "Portal access removed",
        )
      ) {
        closeProfileModal();
        if (person.student) state.profileId = `${person.id}--student`;
        else navigate("portal");
      }
    }
    if (action === "profile-confirm-remove-student") {
      const { person } = profileContext();
      if (
        dispatch(
          (nextStore) => nextStore.removeStudent(person.id),
          "Student role removed",
        )
      ) {
        closeProfileModal();
        if (person.portal) state.profileId = `${person.id}--portal`;
        else navigate("students");
      }
    }
  } catch (error) {
    toast("The action could not be completed. " + error.message);
  }
  if (!modalWasOpen && $("#modal").open)
    profileOpener = {
      action,
      id: action === "profile-alert" ? "" : target.dataset.id || "",
    };
});

document.addEventListener("change", (event) => {
  const input = event.target;
  if (input.closest("#profile-portal-form") && input.name === "vouchers") {
    const form = $("#profile-portal-form");
    const selectedGroups = new FormData(form).getAll("groups");
    $("#profile-portal-groups").innerHTML = profilePortalGroupChecks(
      new FormData(form).getAll("vouchers"),
      selectedGroups,
    );
  }
  if (input.id === "profile-student-voucher") {
    const group = $("#profile-student-group");
    const selected = group.value;
    group.innerHTML = groupOptions(input.value, selected);
    if (!groupsForVouchers([input.value], db.groups).includes(selected))
      group.value = "";
  }
});

document.addEventListener("submit", (event) => {
  if (!event.target.id.startsWith("profile-")) return;
  event.preventDefault();
  const { person } = profileContext();
  if (!person) return;
  const form = event.target;
  const data = new FormData(form);
  try {
    if (form.id === "profile-training-form") {
      const courseId = data.get("course");
      if (!courseId) {
        $("#profile-training-error").textContent = "Choose a course.";
        return;
      }
      if (
        dispatch(
          (nextStore) => nextStore.assignCourse(person.id, { courseId }),
          "Course assigned",
        )
      )
        closeProfileModal();
    }
    if (form.id === "profile-details-form") {
      const input = {
        name: String(data.get("name") || "").trim(),
        email: String(data.get("email") || "")
          .trim()
          .toLowerCase(),
        workRole: String(data.get("workRole") || "").trim(),
      };
      const errors = [];
      if (!input.name) errors.push("Enter a name");
      if (!validEmail(input.email)) errors.push("Enter a valid email address");
      if (errors.length) {
        $("#profile-details-error").textContent = errors.join(". ") + ".";
        return;
      }
      if (
        dispatch(
          (nextStore) => nextStore.updatePersonDetails(person.id, input),
          "Details saved",
        )
      )
        closeProfileModal();
    }
    if (form.id === "profile-portal-form") {
      const role = data.get("role");
      const vouchers = data.getAll("vouchers");
      const groups = data
        .getAll("groups")
        .filter((group) =>
          groupsForVouchers(vouchers, db.groups).includes(group),
        );
      const errors = [];
      if (!vouchers.length) errors.push("Choose at least one voucher");
      if (!groups.length) errors.push("Choose at least one admin group");
      if (role === "Limited Admin" && vouchers.length !== 1)
        errors.push("A Limited Admin can only have one voucher");
      if (errors.length) {
        $("#profile-portal-error").textContent = errors.join(". ") + ".";
        return;
      }
      if (
        dispatch(
          (nextStore) =>
            nextStore.editPortalAccess(person.id, {
              name: person.name,
              email: person.email,
              role,
              vouchers,
              groups,
              teams: data.getAll("teams"),
              status: data.get("status"),
            }),
          "Admin access saved",
        )
      )
        closeProfileModal();
    }
    if (form.id === "profile-student-form") {
      const voucher = data.get("voucher");
      if (!voucher) {
        $("#profile-student-error").textContent = "Choose a voucher.";
        return;
      }
      if (
        dispatch(
          (nextStore) =>
            nextStore.editStudentDetails(person.id, {
              name: person.name,
              email: person.email,
              workRole: person.workRole,
              voucher,
              group: data.get("group") || "",
              team: data.get("team") || "",
              status: data.get("status"),
            }),
          "Student details saved",
        )
      )
        closeProfileModal();
    }
  } catch (error) {
    const errorBox = form.querySelector(".inline-error");
    if (errorBox) errorBox.textContent = error.message;
  }
});
