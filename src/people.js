// People model v2 — loaded after fidelity.js and overrides parts of it.
// Covers: vouchers before admin groups, one person holding both roles,
// inviting people who have no SANS account yet, and team membership vs team access.

// ---------- Shared helpers ----------
function linkedPerson(email, type) {
  const e = String(email || "")
    .trim()
    .toLowerCase();
  return e
    ? db.users.find((u) => u.type === type && u.email.toLowerCase() === e)
    : null;
}
function otherType(type) {
  return type === "portal" ? "student" : "portal";
}
var LIMITED = "Limited Admin";
var ROLE_HINTS = {
  Admin: "Approves training · manages vouchers, teams and portal users",
  "Limited Admin":
    "Approves training for one voucher, across one or more admin groups",
  Viewer: "Read-only reporting and activity",
};

// Small tag under a person's name when they also hold the other role.
function dualTag(u) {
  const other = linkedPerson(u.email, otherType(u.type));
  if (!other) return "";
  return `<button class="role-tag" data-action="open-linked" data-id="${esc(other.id)}" title="Open their ${other.type === "student" ? "student" : "portal user"} record">${icon(other.type === "student" ? "book" : "users")}${other.type === "student" ? "Also a student" : "Also a portal user"}</button>`;
}

// Row-menu shortcut to give someone the role they don't have yet.
function roleShortcut(u) {
  if (linkedPerson(u.email, otherType(u.type))) return "";
  return u.type === "portal"
    ? btn("Add as student", "add-as-student", "", 'data-id="' + esc(u.id) + '"')
    : btn(
        "Invite as portal user",
        "invite-as-portal",
        "",
        'data-id="' + esc(u.id) + '"',
      );
}

// Admin-group options for a single voucher (students).
function groupOptions(voucher, current) {
  if (!voucher) return '<option value="">—</option>';
  return opts(
    groupsForVouchers([voucher], db.groups),
    current,
    "Leave unassigned",
  );
}

// Groups offered in the CSV review picker follow the row's voucher (or every selected row's voucher).
function pickerGroups() {
  const p = state.picker;
  if (!p) return db.groups;
  const rows = p.bulk
    ? state.staged.filter((r) => state.selected.includes(r.id) && !r.saved)
    : [state.staged[p.index]].filter(Boolean);
  const vouchers = [
    ...new Set(rows.map((r) => r.voucher).filter((v) => VOUCHERS.includes(v))),
  ];
  if (!vouchers.length) return db.groups;
  return vouchers.reduce(
    (acc, v) =>
      acc.filter((g) => groupsForVouchers([v], db.groups).includes(g)),
    [...db.groups],
  );
}

// SANS account lookup feedback (mocked). No account no longer blocks: they are invited to create one.
function accountState(email, type) {
  const e = String(email || "")
    .trim()
    .toLowerCase();
  if (!e) return "empty";
  if (!validEmail(e)) return "invalid";
  if (linkedPerson(e, type)) return "duplicate";
  if (linkedPerson(e, otherType(type)) || accountLinked(e)) return "linked";
  return "new";
}
function accountClass(email, type) {
  return (
    { invalid: "unlinked", duplicate: "unlinked", new: "new-account" }[
      accountState(email, type)
    ] || ""
  );
}
function accountStatus(email, type) {
  switch (accountState(email, type)) {
    case "invalid":
      return `${icon("info")}Enter a valid email address`;
    case "duplicate":
      return `${icon("info")}${type === "student" ? "Already a student. Edit their existing record instead." : "Already a portal user. Edit their existing record instead."}`;
    case "linked":
      return `${icon("check")}Linked to an existing SANS account`;
    case "new":
      return `${icon("mail")}No SANS account found. We’ll invite them to create one, then add them automatically.`;
    default:
      return "";
  }
}

// Explains what happens when the email already belongs to someone in the other role.
function linkedNote(email, type) {
  const other = linkedPerson(email, otherType(type));
  if (!other || linkedPerson(email, type)) return "";
  if (type === "student")
    return `<div class="note linked-note">${icon("users")}<div><strong>${esc(other.name)} is already a portal user</strong> (${esc(other.role)} · ${esc(other.vouchers.join(", ") || "no vouchers")}).<br>Adding them as a student gives them a training record. Their portal access won’t change.</div></div>`;
  return `<div class="note linked-note">${icon("book")}<div><strong>${esc(other.name)} is already a student</strong> · ${esc(other.vouchers[0] || "No voucher")} · ${esc(other.groups[0] || "No admin group")} · ${esc(other.teams[0] || "No team")}.<br>Their student record stays as it is. This invitation adds portal access.</div></div>`;
}

// ---------- Invite portal user ----------
function scopeInputs(kind, items, selected, type = "checkbox") {
  return `<div class="scope-options checks" data-scope-list="${kind}">${items.map((x) => `<label class="check scope-choice" data-scope-value="${esc(x.toLowerCase())}"><input type="${type}" name="${kind}" value="${esc(x)}" ${selected.includes(x) ? "checked" : ""}><span>${esc(x)}</span>${kind === "teams" ? `<small>${db.users.filter((u) => u.type === "student" && u.teams.includes(x)).length} members</small>` : kind === "vouchers" ? `<small>${(VOUCHER_GROUPS[x] || db.groups).length} admin ${(VOUCHER_GROUPS[x] || db.groups).length === 1 ? "group" : "groups"}</small>` : ""}</label>`).join("")}</div>`;
}
function scopeSections(p) {
  const limited = p.role === LIMITED,
    type = limited ? "radio" : "checkbox";
  const available = groupsForVouchers(p.vouchers, db.groups);
  const voucher = `<section class="field-section"><label>Voucher access <span class="required">*</span> ${helpMark("Vouchers sit at the top level. The admin groups you can choose depend on the vouchers selected here.")}</label><p class="hint">${limited ? "A Limited Admin is scoped to one voucher." : "Choose vouchers first. Admin groups follow from the vouchers you pick."}</p><div class="search scope-search">${icon("search")}<input id="voucher-scope-search" placeholder="Search vouchers" aria-label="Search vouchers" data-scope-search="vouchers"></div>${scopeInputs("vouchers", VOUCHERS, p.vouchers, type)}</section>`;
  const groups = `<section class="field-section"><div class="group-label"><label>Admin Groups <span class="required">*</span> ${helpMark("Only admin groups covered by the selected vouchers are shown.")}</label>${available.length ? `<label class="check"><input type="checkbox" id="all-groups" ${available.every((g) => p.groups.includes(g)) ? "checked" : ""}>All admin groups in ${p.vouchers.length === 1 ? "this voucher" : "these vouchers"}</label>` : ""}</div>${available.length ? `<p class="hint">Showing ${available.length} of ${db.groups.length} admin groups, covered by ${esc(p.vouchers.join(", "))}.</p>${scopeInputs("groups", available, p.groups)}` : `<div class="scope-empty">${icon("info")}Choose a voucher to see the admin groups it covers.</div>`}</section>`;
  const teams = `<section class="field-section team-access-section"><label>Team access <span class="required">*</span> ${helpMark("Access lets this person see and manage a team. It doesn’t make them a member of it.")}</label><p class="hint">Teams can include students from any voucher. Access doesn’t make this person a team member.</p><div class="team-search-row"><div class="search scope-search">${icon("search")}<input id="team-scope-search" placeholder="Search teams" aria-label="Search teams" data-scope-search="teams"></div><label class="check"><input type="checkbox" id="all-teams" ${db.teams.every((t) => p.teams.includes(t)) ? "checked" : ""}>Select all</label></div>${scopeInputs("teams", db.teams, p.teams)}</section>`;
  return voucher + groups + teams;
}
portalForm = function () {
  state.modal = "portal-detail";
  const p = state.portal;
  openModal(
    "Invite Portal User",
    "Choose what this person can access. They will be able to sign in to the portal.",
    `<form id="portal-form"><div class="two-column"><div class="form-panel"><div class="field email-field"><label for="portal-email">Email Address <span class="required">*</span></label><input id="portal-email" type="email" name="email" required value="${esc(p.email)}" autocomplete="off"><p id="portal-account" class="account-status ${accountClass(p.email, "portal")}">${accountStatus(p.email, "portal")}</p></div><div id="portal-linked">${linkedNote(p.email, "portal")}</div><section class="field-section role-section"><label>Choose role <span class="required">*</span> ${helpMark("Choose the level of access this user will have.")}</label><div class="role-picker">${ROLES.map((r) => `<label class="role-option"><input type="radio" name="role" value="${r}" ${p.role === r ? "checked" : ""}><strong>${r}</strong><small>${ROLE_HINTS[r]}</small></label>`).join("")}</div></section><div id="portal-scope">${scopeSections(p)}</div><p class="inline-error" id="portal-error" role="alert"></p></div><div id="permission-preview">${summary(p)}</div></div></form>`,
    `<div class="actions">${btn("Cancel", "close-modal", "text")}<button class="button primary" type="submit" form="portal-form">Review Invitation</button></div>`,
    steps("Role and Access", "Review & Send", 1),
  );
  syncMasters();
};
const fidelityReadPortal = readPortal;
readPortal = function () {
  const p = fidelityReadPortal();
  const available = groupsForVouchers(p.vouchers, db.groups);
  p.groups = p.groups.filter((g) => available.includes(g));
  if (p.role === LIMITED) {
    p.vouchers = p.vouchers.slice(0, 1);
    p.groups = p.groups.filter((g) =>
      groupsForVouchers(p.vouchers, db.groups).includes(g),
    );
  }
  const student = linkedPerson(p.email, "student");
  if (student) p.name = student.name;
  state.portal = p;
  return p;
};
function syncMasters() {
  for (const [name, id] of [
    ["groups", "all-groups"],
    ["teams", "all-teams"],
  ]) {
    const master = document.getElementById(id);
    if (!master) continue;
    const boxes = [
      ...document.querySelectorAll(`#portal-form input[name="${name}"]`),
    ];
    const count = boxes.filter((b) => b.checked).length;
    master.checked = count === boxes.length && count > 0;
    master.indeterminate = count > 0 && count < boxes.length;
  }
}
function portalErrors(p) {
  const e = [];
  if (!validEmail(p.email)) e.push("Enter a valid email address.");
  else if (linkedPerson(p.email, "portal"))
    e.push("This email is already a portal user.");
  if (!p.vouchers.length) e.push("Choose at least one voucher.");
  if (!p.groups.length) e.push("Choose at least one admin group.");
  if (!p.teams.length) e.push("Choose at least one team.");
  return e;
}
// Validate before the original submit handler runs, so the messages match the new rules.
document.addEventListener(
  "submit",
  (e) => {
    if (e.target.id !== "portal-form") return;
    const errors = portalErrors(readPortal());
    if (errors.length) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const box = $("#portal-error");
      box.textContent = errors.join(" ");
      box.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  },
  true,
);

// ---------- Edit a person ----------
const baseEditForm = editForm,
  baseSaveEdit = saveEdit;
function linkedEditNote(u) {
  const other = linkedPerson(u.email, otherType(u.type));
  if (!other)
    return `<p class="hint linked-hint">${u.type === "portal" ? "Not a student." : "Not a portal user."} <button type="button" class="button-link" data-action="${u.type === "portal" ? "add-as-student" : "invite-as-portal"}" data-id="${esc(u.id)}">${u.type === "portal" ? "Add as student" : "Invite as portal user"}</button></p>`;
  return `<div class="note linked-note">${icon(other.type === "student" ? "book" : "users")}<div>${other.type === "student" ? `<strong>Also a student</strong> · ${esc(other.vouchers[0])} · ${esc(other.groups[0] || "No admin group")} · ${esc(other.teams[0] || "No team")}` : `<strong>Also a portal user</strong> · ${esc(other.role)}`}. <button type="button" class="button-link" data-action="open-linked" data-id="${esc(other.id)}">Open ${other.type === "student" ? "student" : "portal user"} record</button></div></div>`;
}
function editGroupChecks(vouchers, selected) {
  const available = groupsForVouchers(vouchers, db.groups);
  return available.length
    ? choices("groups", available, selected)
    : '<div class="scope-empty">Choose a voucher to see its admin groups.</div>';
}
editForm = function (id, index = null) {
  if (index !== null) return baseEditForm(id, index);
  const u = db.users.find((x) => x.id === id);
  if (!u) return;
  state.modal = "edit-user";
  state.editing = id;
  const portal = u.type === "portal";
  const status = `<div class="field"><label for="edit-status">Status</label><select id="edit-status" name="status">${opts(["Active", "Pending invite", "Suspended"], u.status)}</select><p class="hint">${u.accountSetup && u.status === "Pending invite" ? "Awaiting SANS account. " : ""}Choose Active to simulate accepting the invitation.</p></div>`;
  const body = portal
    ? `<div class="field"><label for="edit-role">Role</label><select id="edit-role" name="role">${opts(u.role === "SSO Admin" ? [...ROLES, "SSO Admin"] : ROLES, u.role)}</select><p class="hint">Limited Admins are scoped to one voucher. They can cover several of its admin groups.</p></div>${status}<div class="field"><label>Voucher access <span class="required">*</span></label>${choices("vouchers", VOUCHERS, u.vouchers)}</div><div class="field"><label>Admin Groups <span class="required">*</span></label><div id="edit-groups">${editGroupChecks(u.vouchers, u.groups)}</div></div><div class="field"><label>Team access</label>${choices("teams", db.teams, u.teams)}<p class="hint">Access to a team doesn’t make them a member.</p></div>`
    : `<div class="field"><label for="edit-voucher">Voucher <span class="required">*</span></label><select id="edit-voucher" name="voucher" required>${opts(VOUCHERS, u.vouchers[0])}</select></div><div class="field"><label for="edit-group">Admin Group</label><select id="edit-group" name="group">${groupOptions(u.vouchers[0], u.groups[0])}</select><p class="hint">Filtered by voucher.</p></div><div class="field"><label for="edit-team">Team</label><select id="edit-team" name="team">${opts(db.teams, u.teams[0], "Leave unassigned")}</select><p class="hint">Makes them a member of this team.</p></div><div class="field"><label for="edit-work">Work role</label><input id="edit-work" name="workRole" value="${esc(u.workRole)}"></div>${status}`;
  openModal(
    "Edit " + (portal ? "portal user" : "student"),
    "Changes are saved to the mock database in this browser.",
    `<form id="edit-form">${linkedEditNote(u)}<div class="form-grid"><div class="field"><label for="edit-name">Full name <span class="required">*</span></label><input id="edit-name" name="name" required value="${esc(u.name)}"></div><div class="field"><label for="edit-email">Email address <span class="required">*</span></label><input id="edit-email" type="email" name="email" required value="${esc(u.email)}"></div>${body}</div><p class="inline-error" id="edit-error" role="alert"></p></form>`,
    `${btn(icon("trash") + "Delete record", "delete-user", "danger", 'data-id="' + esc(u.id) + '"')}<div class="actions">${btn("Cancel", "close-modal", "text")}<button class="button primary" type="submit" form="edit-form">Save changes</button></div>`,
  );
};
saveEdit = function () {
  if (state.modal !== "edit-user") return baseSaveEdit();
  const old = db.users.find((u) => u.id === state.editing);
  if (!old) return;
  const fd = new FormData($("#edit-form"));
  const name = String(fd.get("name") || "").trim(),
    email = String(fd.get("email") || "")
      .trim()
      .toLowerCase(),
    status = fd.get("status");
  const errors = [];
  if (!name) errors.push("Enter a name");
  const sameType = db.users.filter(
    (u) => u.id !== old.id && u.type === old.type,
  );
  let next;
  if (old.type === "portal") {
    const role = fd.get("role"),
      vouchers = fd.getAll("vouchers"),
      groups = fd
        .getAll("groups")
        .filter((g) => groupsForVouchers(vouchers, db.groups).includes(g)),
      teams = fd.getAll("teams");
    if (!validEmail(email)) errors.push("Enter a valid email address");
    if (sameType.some((u) => u.email.toLowerCase() === email))
      errors.push("This email is already a portal user");
    if (!vouchers.length) errors.push("Choose at least one voucher");
    if (!groups.length) errors.push("Choose at least one admin group");
    if (role === LIMITED && vouchers.length > 1)
      errors.push("A Limited Admin can only have one voucher");
    next = { name, email, role, vouchers, groups, teams, status };
  } else {
    const d = {
      name,
      email,
      voucher: fd.get("voucher"),
      group: fd.get("group") || "",
      team: fd.get("team") || "",
    };
    errors.push(...validateCandidate(d, sameType, [], db));
    next = {
      name,
      email,
      vouchers: d.voucher ? [d.voucher] : [],
      groups: d.group ? [d.group] : [],
      teams: d.team ? [d.team] : [],
      workRole: String(fd.get("workRole") || "").trim() || "Student",
      status,
    };
  }
  if (errors.length) {
    $("#edit-error").textContent = errors.join(". ") + ".";
    return;
  }
  if (
    dispatch(
      (st) =>
        old.type === "portal"
          ? st.editPortalAccess(old.id, next)
          : st.editStudentDetails(old.id, next),
      "Changes saved",
    )
  ) {
    $("#modal").close();
    state.modal = null;
    state.editing = null;
    render();
  }
};

// ---------- Teams and admin groups: membership vs access ----------
directory = function () {
  const teams = state.view === "teams",
    items = teams ? db.teams : db.groups;
  return (
    heading(
      teams ? "Teams" : "Admin Groups",
      teams
        ? "Teams group students for organisation and reporting. One team can include students from different vouchers."
        : "Admin groups sit within vouchers and route training approvals.",
      teams ? btn(icon("plus") + "Create team", "create-team", "primary") : "",
    ) +
    `<div class="directory">${items
      .map((name) => {
        const key = teams ? "teams" : "groups";
        const members = db.users.filter(
          (u) => u.type === "student" && u[key].includes(name),
        ).length;
        const access = db.users.filter(
          (u) => u.type === "portal" && u[key].includes(name),
        ).length;
        const covered = teams
          ? ""
          : Object.entries(VOUCHER_GROUPS)
              .filter(([, g]) => g.includes(name))
              .map(([v]) => v);
        return `<section class="card"><div class="directory-icon">${icon(teams ? "users" : "grid")}</div><h2>${esc(name)}</h2><dl class="directory-stats"><div><dt>${teams ? "Members" : "Students"}</dt><dd>${members}</dd></div><div><dt>Portal users with access</dt><dd>${access}</dd></div></dl>${teams ? "" : `<p class="covered-by">Covered by ${esc(covered.join(", ") || "no vouchers")}</p>`}${btn("View people" + icon("arrow"), "directory-members", "", 'data-name="' + esc(name) + '"')}</section>`;
      })
      .join("")}</div>`
  );
};
function personRow(u) {
  return `<div class="student-draft"><span class="initials">${esc(initial(u.name))}</span><div class="details"><strong>${esc(u.name)}</strong><p class="secondary">${esc(u.email)} · ${u.type === "portal" ? esc(u.role) : esc(u.vouchers[0] || "")}</p></div>${labelStatus(u.status)}</div>`;
}
document.addEventListener(
  "click",
  (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const a = target.dataset.action,
      id = target.dataset.id;
    if (a === "directory-members") {
      event.stopImmediatePropagation();
      const name = target.dataset.name,
        teams = state.view === "teams",
        key = teams ? "teams" : "groups";
      const members = db.users.filter(
          (u) => u.type === "student" && u[key].includes(name),
        ),
        access = db.users.filter(
          (u) => u.type === "portal" && u[key].includes(name),
        );
      state.modal = "members";
      openModal(
        esc(name),
        teams
          ? `${members.length} members · ${access.length} portal users with access`
          : `${members.length} students · ${access.length} portal users with access`,
        `<h3 class="members-heading">${teams ? "Members" : "Students"}</h3><p class="hint">${teams ? "Students assigned to this team." : "Students assigned to this admin group."}</p>${members.map(personRow).join("") || '<p class="muted">No students assigned yet.</p>'}<h3 class="members-heading">Portal users with access</h3><p class="hint">Can see and manage this ${teams ? "team" : "admin group"}. Not members.</p>${access.map(personRow).join("") || '<p class="muted">No portal users have access yet.</p>'}`,
        `<div class="actions">${btn("Done", "close-modal", "primary")}</div>`,
      );
      return;
    }
    if (a === "open-linked") {
      event.stopImmediatePropagation();
      const other = db.users.find((u) => u.id === id);
      if (!other) return;
      if ($("#modal").open) {
        $("#modal").close();
        state.modal = null;
      }
      navigate(other.type === "portal" ? "portal" : "students");
      editForm(other.id);
      return;
    }
    if (a === "add-as-student") {
      event.stopImmediatePropagation();
      const u = db.users.find((x) => x.id === id);
      if (!u) return;
      if ($("#modal").open) {
        $("#modal").close();
        state.modal = null;
      }
      state.rowMenu = null;
      state.menu = false;
      state.drafts = [];
      state.studentEntry = { email: u.email };
      state.entryOpen = true;
      state.reuseAssignments = false;
      state.modal = "student-new";
      render();
      studentForm();
      return;
    }
    if (a === "invite-as-portal") {
      event.stopImmediatePropagation();
      const u = db.users.find((x) => x.id === id);
      if (!u) return;
      if ($("#modal").open) {
        $("#modal").close();
        state.modal = null;
      }
      state.rowMenu = null;
      render();
      invite();
      state.portal.email = u.email;
      state.portal.name = u.name;
      portalForm();
      return;
    }
  },
  true,
);

// ---------- Live form behaviour ----------
document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.id === "student-voucher") {
    const group = $("#student-group");
    const keep = group.value;
    group.innerHTML = groupOptions(el.value, keep);
    group.disabled = !el.value;
    if (!groupsForVouchers([el.value], db.groups).includes(keep))
      group.value = "";
    $("#student-group-hint").textContent = el.value
      ? "Optional · filtered by voucher."
      : "Choose a voucher first.";
  }
  if (el.id === "edit-voucher") {
    const group = $("#edit-group");
    const keep = group.value;
    group.innerHTML = groupOptions(el.value, keep);
    if (!groupsForVouchers([el.value], db.groups).includes(keep))
      group.value = "";
  }
  if (el.closest("#edit-form") && el.name === "vouchers") {
    const fd = new FormData($("#edit-form"));
    $("#edit-groups").innerHTML = editGroupChecks(
      fd.getAll("vouchers"),
      fd.getAll("groups"),
    );
  }
  if (
    el.closest("#portal-form") &&
    (el.name === "role" || el.name === "vouchers")
  ) {
    const body = $("#modal .modal-body"),
      top = body?.scrollTop;
    const p = readPortal();
    $("#portal-scope").innerHTML = scopeSections(p);
    $("#permission-preview").innerHTML = summary(p);
    syncMasters();
    if (body) body.scrollTop = top;
  }
  if (
    el.id === "all-groups" ||
    (el.closest?.("#portal-form") && el.name === "groups")
  )
    syncMasters();
});
document.addEventListener("input", (e) => {
  if (e.target.id !== "portal-email") return;
  const email = e.target.value;
  $("#portal-account").className =
    "account-status " + accountClass(email, "portal");
  $("#portal-account").innerHTML = accountStatus(email, "portal");
  $("#portal-linked").innerHTML = linkedNote(email, "portal");
});

render();
