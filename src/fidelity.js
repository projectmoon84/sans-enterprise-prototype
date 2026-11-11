// Original Figma admin-management screens, implemented as reusable DOM components.
// The app's existing local database and commit boundary remain the source of data.
const SANS_LOGO = `/* SANS LOGO */`;
// Figma icons for the CSV upload step, embedded from src/assets by build.mjs.
const CSV_FILE_ICON = `/* ICON CSV FILE */`;
const UPLOAD_CLOUD_ICON = `/* ICON UPLOAD CLOUD */`;
Object.assign(state, {
  selected: [],
  group: "",
  voucher: "",
  sort: "",
  sortDirection: 1,
  rowMenu: null,
  actionsOpen: false,
  profileOpen: false,
  entryOpen: true,
  studentEntry: {},
  reuseAssignments: false,
  upload: null,
  picker: null,
  onlyErrors: false,
  importAlertDismissed: false,
});

const mockUnavailable = new Set([
  "samira.khan@example.com",
  "jane.doe@example.com",
  "john.smith@example.com",
  "susan.lee@example.com",
  "michael.brown@example.com",
]);
const emailName = (email) =>
  email
    .split("@")[0]
    .replace(/[._-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");
const accountLinked = (email) =>
  validEmail(email) && !mockUnavailable.has(email.toLowerCase());
const menuIcon = () => icon("more_vert");
const downIcon = () => icon("arrow_downward");
const csvIcon = () =>
  '<svg class="csv-icon" viewBox="0 0 38 44" aria-hidden="true"><path fill="#00a63e" d="M3 0h22l13 13v28a3 3 0 0 1-3 3H3a3 3 0 0 1-3-3V3a3 3 0 0 1 3-3"/><path fill="#69d58f" d="M25 0v10a3 3 0 0 0 3 3h10"/><text x="6" y="34" fill="white" font-size="10" font-family="Arial" font-weight="700">CSV</text></svg>';
const termLink =
  '<button type="button" class="button-link" data-action="terms">terms and conditions</button>';
const metaDate = (iso) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
// "Last modified by" is read from the newest activity event for the person.
const metaFor = (u) => ({
  name: u.lastModifiedBy || "No changes yet",
  detail: u.lastModifiedAt
    ? `${u.lastModifiedRole ? `Portal ${u.lastModifiedRole} · ` : ""}${metaDate(u.lastModifiedAt)}`
    : "",
  last:
    u.lastAccess || (u.status === "Pending invite" ? "Just invited" : "Today"),
  ...u.meta,
});
function chooseLabel(items, current, placeholder) {
  return opts(items, current, placeholder);
}
function filterSelect(name, items, value, label) {
  return `<select id="${name}-filter" data-filter="${name}" aria-label="Filter by ${label.toLowerCase()}">${chooseLabel(items, value, label)}</select>`;
}
function checkRow(id, checked, label) {
  return `<input class="row-check" type="checkbox" data-select="${esc(id)}" aria-label="${esc(label)}" ${checked ? "checked" : ""}>`;
}
function rowActions(u) {
  return `<div class="menu-anchor row-menu-anchor" data-spec="people.row-menu" data-spec-label="Row menu"><button class="icon-btn kebab" aria-label="Actions for ${esc(u.name || u.email)}" aria-expanded="${state.rowMenu === u.id}" data-action="row-menu" data-id="${esc(u.id)}">${menuIcon()}</button>${state.rowMenu === u.id ? `<div class="dropdown-menu row-dropdown">${btn("Edit details", "edit-user", "", 'data-id="' + esc(u.id) + '"')}${u.status === "Pending invite" ? btn("Resend invitation", "resend-user", "", 'data-id="' + esc(u.id) + '"') : btn(u.status === "Suspended" ? "Activate user" : "Suspend user", "set-user-status", "", 'data-id="' + esc(u.id) + '" data-status="' + (u.status === "Suspended" ? "Active" : "Suspended") + '"')}${roleShortcut(u)}${btn("Remove…", "delete-user", "danger", 'data-id="' + esc(u.id) + '"')}</div>` : ""}</div>`;
}
function actionsMenu(imported = false) {
  const n = state.selected.length;
  return `<div class="menu-anchor">${btn("Actions" + icon("chevron"), "toggle-actions", "", 'aria-expanded="' + state.actionsOpen + '"')}${state.actionsOpen ? `<div class="dropdown-menu actions-dropdown">${btn("Export CSV", "export-csv")}${imported ? `${btn("Assign voucher", "bulk-picker", "", 'data-kind="voucher" ' + (!n ? "disabled" : ""))}${btn("Assign admin group", "bulk-picker", "", 'data-kind="group" ' + (!n ? "disabled" : ""))}${btn("Assign team", "bulk-picker", "", 'data-kind="team" ' + (!n ? "disabled" : ""))}${btn("Remove selected rows", "remove-selected-import", "danger", !n ? "disabled" : "")}` : `${btn("Activate selected", "bulk-status", "", 'data-status="Active" ' + (!n ? "disabled" : ""))}${btn("Suspend selected", "bulk-status", "", 'data-status="Suspended" ' + (!n ? "disabled" : ""))}${btn("Resend invitations", "bulk-resend", "", !n ? "disabled" : "")}${btn("Delete selected", "bulk-delete", "danger", !n ? "disabled" : "")}`}</div>` : ""}</div>`;
}
function toolbar(imported = false) {
  const portal = state.view === "portal";
  return `<div class="toolbar fidelity-toolbar" data-spec="people.toolbar" data-spec-label="Filters, search and Actions">${actionsMenu(imported)}<span class="filter-label">Filter</span>${portal ? filterSelect("role", [...ROLES, "SSO Admin"], state.role, "Role") : `${filterSelect("voucher", VOUCHERS, state.voucher, "Voucher")}${filterSelect("group", db.groups, state.group, "Admin Group")}${filterSelect("team", db.teams, state.team, "Team")}`}${portal || imported ? filterSelect("status", imported ? ["Ready", "Needs attention", "Added"] : ["Active", "Pending invite", "Suspended"], state.status, "Status") : ""}<div class="search">${icon("search")}<input id="people-search" placeholder="Search name or email" aria-label="Search name or email" value="${esc(state.search)}"></div>${state.selected.length ? `<span class="selection-count">${state.selected.length} selected</span>` : ""}</div>`;
}
function matchesFilters(u, imported = false) {
  const groups = imported ? (u.group ? [u.group] : []) : u.groups;
  const teams = imported ? (u.team ? [u.team] : []) : u.teams;
  const vouchers = imported ? (u.voucher ? [u.voucher] : []) : u.vouchers;
  const status = imported
    ? u.saved
      ? "Added"
      : importErrors(u).length
        ? "Needs attention"
        : "Ready"
    : u.status;
  return (
    (u.name + " " + u.email)
      .toLowerCase()
      .includes(state.search.toLowerCase()) &&
    (!state.role || u.role === state.role) &&
    (!state.status || state.status === status) &&
    (!state.group || groups.includes(state.group)) &&
    (!state.team || teams.includes(state.team)) &&
    (!state.voucher || vouchers.includes(state.voucher)) &&
    (!state.onlyErrors || !imported || importErrors(u).length)
  );
}
function ordered(rows) {
  if (!state.sort) return rows;
  return [...rows].sort(
    (a, b) =>
      String(a[state.sort] || "").localeCompare(String(b[state.sort] || "")) *
      state.sortDirection,
  );
}
function tableHead(label, key, sort = true) {
  return `<th>${sort ? `<button class="sort-button" data-action="sort" data-key="${key}">${label}${downIcon()}</button>` : label}</th>`;
}
function allSelected(rows) {
  return rows.length > 0 && rows.every((u) => state.selected.includes(u.id));
}
const oldNavigate = navigate;
navigate = function (view) {
  state.selected = [];
  state.group = "";
  state.voucher = "";
  state.onlyErrors = false;
  state.actionsOpen = false;
  state.rowMenu = null;
  oldNavigate(view);
};
function signedInPortalUser() {
  const actorId = store.snapshot().session.actorId;
  return (
    db.users.find(
      (user) => user.type === "portal" && user.personId === actorId,
    ) || db.users.find((user) => user.type === "portal")
  );
}
// SANS staff who look after customer organizations. They are not people in this organization, so they
// live outside the database; who is signed in is remembered in this browser. Only SANS staff see the
// SANS Administration section of the sidebar.
const SANS_STAFF = [
  { id: "sans-morgan-hale", name: "Morgan Hale", role: "SANS Administrator" },
  { id: "sans-jordan-ellis", name: "Jordan Ellis", role: "SANS Administrator" },
];
const SANS_VIEWS = ["customer-organizations", "internal-users", "dashboard-configuration"];
const SANS_STAFF_KEY = "sans-enterprise-staff-session";
state.sansStaffId = (() => {
  try {
    const id = localStorage.getItem(SANS_STAFF_KEY);
    return SANS_STAFF.some((staff) => staff.id === id) ? id : null;
  } catch {
    return null;
  }
})();
function signedInSansStaff() {
  return SANS_STAFF.find((staff) => staff.id === state.sansStaffId) || null;
}
function setSansStaff(id) {
  state.sansStaffId = id;
  try {
    if (id) localStorage.setItem(SANS_STAFF_KEY, id);
    else localStorage.removeItem(SANS_STAFF_KEY);
  } catch {}
}
function signedInName() {
  return signedInSansStaff()?.name || signedInPortalUser()?.name || "Portal user";
}
function profileMenuContents() {
  const staff = signedInSansStaff();
  const actor = signedInPortalUser();
  const current = staff || actor;
  const users = db.users.filter((user) => user.type === "portal");
  return `<div class="profile-menu-current"><span class="secondary">Signed In As</span><strong>${esc(current?.name || "Portal user")}</strong><span class="secondary">${esc(current?.role || "")}</span></div><div class="dropdown-divider"></div><span class="dropdown-label">Organization Users</span>${users.map((user) => `<button data-action="sign-in-as" data-person-id="${esc(user.personId)}" ${!staff && user.personId === actor?.personId ? 'aria-current="true"' : ""}>${esc(user.name)}<span class="secondary">${esc(user.role)}</span></button>`).join("")}<div class="dropdown-divider"></div><span class="dropdown-label">SANS Staff</span>${SANS_STAFF.map((member) => `<button data-action="sign-in-as-sans" data-staff-id="${esc(member.id)}" ${member.id === staff?.id ? 'aria-current="true"' : ""}>${esc(member.name)}<span class="secondary">${esc(member.role)}</span></button>`).join("")}<div class="dropdown-divider"></div>${btn(icon("database") + "Demo data", "data")}${btn("Use sample CSV", "demo-sample")}${btn("About this prototype", "navigate", "", 'data-view="help"')}`;
}
// ---------- Sidebar (Figma 3195:27193) ----------
// Parent groups start closed; people open the ones they want. A closed group that holds the current page is
// marked as current instead, so the sliding indicator (motion.js) always has somewhere to sit.
const NAV_GROUPS = {
  learner: { label: "Learner Activity", icon: "insert_chart", children: [["Training Progress", "training-progress"], ["Certifications", "certifications"]] },
  training: { label: "Training", icon: "local_library", children: [["Student Requests", "student-requests"]] },
  finance: { label: "Finance", icon: "account_balance", children: [["Spend", "finance"]] },
  people: { label: "People", icon: "person", children: [["Portal Users", "portal"], ["Students", "students"]] },
  groups: { label: "Groups", icon: "groups", children: [["Teams", "teams"], ["Admin Groups", "groups"]] },
};
state.navOpen = [];
function navView() {
  if (state.view === "profile") return state.profileFrom === "students" ? "students" : "portal";
  if (state.view === "import") return "students";
  return state.view;
}
function sideLink(label, view, ico = "", mark = true) {
  const on = mark && navView() === view;
  return `<button class="nav-btn${ico ? "" : " sub"}${on ? " active" : ""}" data-action="navigate" data-view="${view}"${on ? ' aria-current="page"' : ""}>${ico ? icon(ico) : ""}<span class="nav-label">${label}</span></button>`;
}
function sideGroup(key) {
  const group = NAV_GROUPS[key],
    open = state.navOpen.includes(key),
    holdsCurrent = group.children.some(([, view]) => view === navView());
  // The child list is always in the page so it can slide open and closed; inert keeps it out of reach while closed.
  return `<div class="nav-group"><button class="nav-btn nav-parent${!open && holdsCurrent ? " active" : ""}" data-action="toggle-nav-group" data-group="${key}" aria-expanded="${open}" aria-controls="nav-group-${key}">${icon(group.icon)}<span class="nav-label">${group.label}</span>${icon("chevron")}</button><div class="nav-children-wrap" id="nav-group-${key}" data-open="${open}"${open ? "" : " inert"}><div class="nav-children">${group.children.map(([label, view]) => sideLink(label, view, "", open)).join("")}</div></div></div>`;
}
function sidebarNav() {
  return `<div class="nav-main">${sideLink("Home", "home", "home")}${sideGroup("learner")}${sideGroup("training")}${sideGroup("finance")}<div class="nav-divider"></div><div class="nav-section">Your Organization</div>${sideGroup("people")}${sideGroup("groups")}${sideLink("Activity", "activity", "schedule")}${signedInSansStaff() ? `<div class="nav-divider"></div><div class="nav-section nav-section-split"><span>SANS Administration</span><span class="nav-section-note">Internal Only</span></div>${sideLink("Customer Organizations", "customer-organizations", "groups")}${sideLink("Internal Users", "internal-users", "person")}${sideLink("Default Dashboard Configuration", "dashboard-configuration", "insights")}` : ""}</div><div class="nav-foot"><div class="nav-divider"></div>${sideLink("Help & Support", "help", "help")}</div>`;
}
// Pages the new navigation names but the prototype does not cover yet. Home, Spend and Admin Groups had
// earlier stand-in screens; they are blank here until their designs are ready.
const PLANNED_VIEWS = {
  home: ["Home", "Home", "Your organization's training at a glance."],
  finance: ["Spend", "Finance", "See how your organization's training budget is being used."],
  groups: ["Admin Groups", "Your Organization", "Manage the Admin Groups that vouchers cover."],
  "training-progress": ["Training Progress", "Learner Activity", "See how students are moving through their courses."],
  certifications: ["Certifications", "Learner Activity", "Track GIAC certification attempts and renewals."],
  "student-requests": ["Student Requests", "Training", "Review training requests from students."],
  "customer-organizations": ["Customer Organizations", "SANS Administration", "Manage the organizations that use the portal."],
  "internal-users": ["Internal Users", "SANS Administration", "Manage SANS staff with access to the portal."],
  "dashboard-configuration": ["Default Dashboard Configuration", "SANS Administration", "Choose what new organizations see on their dashboard."],
};
const navBaseContent = content;
content = function () {
  if (SANS_VIEWS.includes(state.view) && !signedInSansStaff()) state.view = "home";
  const planned = PLANNED_VIEWS[state.view];
  if (!planned) return navBaseContent();
  const [title, area, description] = planned;
  return `${heading(title, description)}<section class="card planned-page" aria-label="${esc(area)}"><h2>Not in This Prototype Yet</h2><p class="muted">This page is part of the new navigation. Its content will be designed separately.</p></section>`;
};
render = function () {
  const focus = document.activeElement?.id,
    position = document.activeElement?.selectionStart;
  $("#app").innerHTML =
    `<header class="topbar"><button class="icon-btn mobile-menu" data-action="mobile-menu" aria-label="Toggle navigation">${icon("menu")}</button><div class="logo" aria-label="SANS">${SANS_LOGO}</div><span class="org">Organization name</span><div class="right"><div class="menu-anchor"><button class="profile-button" data-action="profile-menu" aria-label="Open profile and demo tools" aria-expanded="${state.profileOpen}"><span class="avatar">${esc(initial(signedInName()))}</span>${icon("chevron")}</button>${state.profileOpen ? `<div class="dropdown-menu profile-dropdown">${profileMenuContents()}</div>` : ""}</div></div></header><aside class="sidebar" aria-label="Main navigation" data-spec="nav.sidebar" data-spec-label="Sidebar navigation">${sidebarNav()}</aside><main class="page view-${state.view}" id="main">${storageError ? `<div class="note warning">${icon("info")}${esc(storageError)}</div>` : ""}${content()}</main>`;
  if (focus && document.getElementById(focus)) {
    const el = document.getElementById(focus);
    el.focus();
    if (typeof position === "number" && el.setSelectionRange)
      el.setSelectionRange(position, position);
  }
};
heading = function (title, description, actions = "") {
  return `<div class="page-head"><div><h1>${title}</h1>${description ? `<p class="muted">${description}</p>` : ""}</div><div class="head-actions">${actions}</div></div>`;
};
peopleView = function () {
  const portal = state.view === "portal",
    type = portal ? "portal" : "student";
  const all = db.users.filter((u) => u.type === type),
    users = ordered(all.filter((u) => matchesFilters(u)));
  const actions = portal
    ? btn(icon("plus") + "Invite Portal user", "invite", "primary", 'data-spec="portal.invite-button" data-spec-label="Invite Portal user button"')
    : `<div class="menu-anchor" data-spec="students.add-menu" data-spec-label="Add students menu">${btn("Add students" + icon("chevron"), "student-menu", "primary", 'aria-expanded="' + state.menu + '"')}${state.menu ? `<div class="dropdown-menu"><button data-action="add-student">Individuals</button><button data-action="upload">Upload a CSV</button></div>` : ""}</div>`;
  const checks = `<th class="selection-col">${checkRow("all", allSelected(users), "Select all visible people")}</th>`;
  return `${heading(portal ? "Portal Users" : "Students", portal ? `${all.length} people can access this portal.` : "Students do not have access to this portal", actions)}<section class="card people-card" aria-label="${portal ? "Portal users" : "Students"} list" data-spec="people.table" data-spec-label="People table">${toolbar()}<div class="table-wrap"><table class="people-table ${portal ? "portal-table" : "students-table"}"><colgroup>${portal ? '<col class="col-check"><col class="col-person"><col class="col-access"><col class="col-modifier"><col class="col-status"><col class="col-menu">' : '<col class="col-check"><col class="col-person"><col class="col-group"><col class="col-team"><col class="col-modifier"><col class="col-status"><col class="col-menu">'}</colgroup><thead><tr>${checks}${tableHead("Name", "name", !portal)}${portal ? tableHead("Access", "access", false) : tableHead("Admin Groups", "groups") + tableHead("Team", "teams")}${tableHead("Last modified by", "updatedAt")}${tableHead(portal ? "Status / Last access" : "Status", "status", !portal)}<th></th></tr></thead><tbody>${
    users.length
      ? users
          .map((u) => {
            const meta = metaFor(u);
            return `<tr${rowHighlight(u)}>${`<td class="selection-col">${checkRow(u.id, state.selected.includes(u.id), "Select " + (u.name || u.email))}</td>`}<td><div class="person-name">${esc(u.name || u.email)}</div>${personMeta(u, portal ? u.role : u.workRole || u.email, "person-role")}</td>${portal ? `<td class="scope">${u.accessLabel ? esc(u.accessLabel) : `${u.vouchers.length} ${u.vouchers.length === 1 ? "Voucher" : "Vouchers"} • ${u.groups.length} Admin ${u.groups.length === 1 ? "Group" : "Groups"} • ${u.teams.length} Teams`}</td>` : `<td class="scope ${u.groups.length ? "" : "unassigned"}">${esc(u.groups.join(", ") || "Unassigned")}</td><td class="scope ${u.teams.length ? "" : "unassigned"}">${esc(u.teams.join(", ") || "Unassigned")}</td>`}<td class="modifier"><span>${esc(meta.name)}</span><span class="secondary">${esc(meta.detail)}</span></td><td class="status-cell">${labelStatus(u.status)}${voucherFlag(u)}${u.accountSetup && u.status === "Pending invite" ? `<span class="secondary account-pending">Awaiting SANS account</span>` : portal ? `<span class="secondary">${esc(meta.last)}</span>` : ""}</td><td class="menu-cell">${rowActions(u)}</td></tr>`;
          })
          .join("")
      : `<tr><td colspan="${portal ? 6 : 7}"><div class="empty">${icon("search")}<h2>No people found</h2><p>Try another name or clear your filters.</p>${btn("Clear filters", "all-filters-clear")}</div></td></tr>`
  }</tbody></table></div></section>`;
};
const baseOpenModal = openModal;
openModal = function (
  title,
  description,
  body,
  footer = "",
  stepMarkup = "",
  compact = false,
) {
  baseOpenModal(title, description, body, footer, stepMarkup, compact);
  const kind = state.modal || "";
  $("#modal").classList.add("fidelity-modal");
  if (kind.startsWith("portal-")) $("#modal").classList.add("portal-modal");
  if (kind.startsWith("student-") || kind === "student-results")
    $("#modal").classList.add("student-modal");
  if (kind === "upload" || kind === "uploading")
    $("#modal").classList.add("upload-modal");
  if (kind === "picker") {
    $("#modal").classList.add("picker-modal");
    if (state.picker.kind === "group")
      $("#modal").classList.add("short-picker");
  }
  if (kind.startsWith("profile-")) $("#modal").classList.add("profile-modal");
  if (kind === "portal-success") {
    $("#modal").classList.add("portal-success-modal");
    $("#modal .modal-header h2")?.remove();
    $("#modal .modal-body h2").id = "modal-title";
  }
};
steps = function (first, second, index) {
  return `<div class="steps"><div class="step ${index > 1 ? "done" : "active"}"><i>${index > 1 ? icon("check") : "1"}</i>${first}</div><span class="step-line"></span><div class="step ${index === 2 ? "active" : ""}"><i>2</i>${second}</div></div>`;
};
function helpMark(text) {
  return `<span class="help-mark" tabindex="0" role="img" aria-label="${esc(text)}" title="${esc(text)}">?</span>`;
}
function permissionLists(role, groups) {
  const outside = groups.length ? groups.join(", ") : "their admin groups";
  const can = permissionCopy(role);
  const cannot =
    role === "Admin"
      ? ["Access vouchers or records outside " + outside + "."]
      : role === "Limited Admin"
        ? [
            "Invite or manage portal users.",
            "Change voucher settings or manage teams.",
            "Access records outside " + outside + ".",
          ]
        : [
            "Approve training requests.",
            "Create, edit or delete records.",
            "Manage portal users, teams or vouchers.",
          ];
  return `<div class="permissions"><h3>They can</h3>${can
    .filter((t) => !t.startsWith("Cannot"))
    .map(
      (t) =>
        `<div class="permission"><span class="permission-icon">${icon("check")}</span><span>${esc(t)}</span></div>`,
    )
    .join(
      "",
    )}<h3>They cannot</h3>${cannot.map((t) => `<div class="permission"><span class="permission-icon negative">${icon("close")}</span><span>${esc(t)}</span></div>`).join("")}</div>`;
}
function reachSentence(p) {
  const v = p.vouchers.length ? p.vouchers.join(", ") : "the selected vouchers";
  const g = p.groups.length ? p.groups.join(", ") : "the selected admin groups";
  return `This person can ${p.role === "Viewer" ? "view reporting and activity for" : "approve training and manage students for"} ${v}, within ${g}, with access to ${p.teams.length} ${p.teams.length === 1 ? "team" : "teams"}.`;
}
summary = function (p) {
  return `<div class="summary-panel"><h3>Summary</h3><p>${esc(reachSentence(p))}</p><div class="summary-fields">${[
    ["Voucher access", p.vouchers],
    ["Admin Groups", p.groups],
    ["Team access", p.teams],
  ]
    .map(
      ([l, a]) =>
        `<div class="summary-block"><span>${l}</span><strong>${a.length ? a.map(esc).join("<br>") : "None selected"}</strong></div>`,
    )
    .join("")}</div>${permissionLists(p.role, p.groups)}</div>`;
};
function scopeChoices(kind, items, selected) {
  return `<div class="scope-options checks" data-scope-list="${kind}">${items.map((x) => `<label class="check scope-choice" data-scope-value="${esc(x.toLowerCase())}"><input type="checkbox" name="${kind}" value="${esc(x)}" ${selected.includes(x) ? "checked" : ""}><span>${esc(x)}</span>${kind === "teams" ? `<small>${db.users.filter((u) => u.type === "student" && u.teams.includes(x)).length} members</small>` : ""}</label>`).join("")}</div>`;
}
portalForm = function () {
  state.modal = "portal-detail";
  const p = state.portal;
  openModal(
    "Invite Portal User",
    "Choose what this person can access. They will be able to sign in to the portal.",
    `<form id="portal-form"><div class="two-column"><div class="form-panel"><div class="field email-field"><label for="portal-email">Email Address <span class="required">*</span></label><input id="portal-email" type="email" name="email" required value="${esc(p.email)}" autocomplete="off"></div><section class="field-section role-section"><label>Choose role <span class="required">*</span> ${helpMark("Choose the level of access this user will have.")}</label><p class="hint">Manage your team members here.</p><div class="role-picker">${ROLES.map((r, i) => `<label class="role-option"><input type="radio" name="role" value="${r}" ${p.role === r ? "checked" : ""}><strong>${r}</strong><small>${["Full management in their assigned area", "Day-to-day training administration", "Read-only reporting and activity"][i]}</small></label>`).join("")}</div></section><section class="field-section"><label>Access levels <span class="required">*</span> ${helpMark("Access is limited to the groups, vouchers and teams you select.")}</label><div class="group-label"><label>Admin Groups <span class="required">*</span> ${helpMark("Select the organisational reach.")}</label><label class="check"><input type="checkbox" id="all-groups" ${db.groups.every((g) => p.groups.includes(g)) ? "checked" : ""}>All Groups</label></div>${scopeChoices("groups", db.groups, p.groups)}</section><section class="field-section"><label>Voucher access <span class="required">*</span> ${helpMark("Choose training vouchers this user can access.")}</label><p class="hint">Showing Vouchers within the selected Admin Groups.<br>They can view reporting and activity for the selected vouchers.</p><label class="search-label" for="voucher-scope-search">Search <span class="required">*</span> ${helpMark("Search the available vouchers.")}</label><div class="search scope-search">${icon("search")}<input id="voucher-scope-search" placeholder="Search Vouchers" data-scope-search="vouchers"></div>${scopeChoices("vouchers", [VOUCHERS[1], VOUCHERS[0], VOUCHERS[3], VOUCHERS[2]], p.vouchers)}</section><section class="field-section team-access-section"><label>Team access <span class="required">*</span> ${helpMark("Choose teams this user can access.")}</label><label class="search-label" for="team-scope-search">Search <span class="required">*</span> ${helpMark("Search the available teams.")}</label><div class="team-search-row"><div class="search scope-search">${icon("search")}<input id="team-scope-search" placeholder="Search Teams" data-scope-search="teams"></div><label class="check"><input type="checkbox" id="all-teams" ${db.teams.every((t) => p.teams.includes(t)) ? "checked" : ""}>Select all</label></div>${scopeChoices("teams", db.teams, p.teams)}</section><p class="inline-error" id="portal-error" role="alert"></p></div><div id="permission-preview">${summary(p)}</div></div></form>`,
    `<div class="actions">${btn("Cancel", "close-modal", "text")}<button class="button primary" type="submit" form="portal-form">Review Invitation</button></div>`,
    steps("Role and Access", "Review & Send", 1),
  );
};
readPortal = function () {
  const fd = new FormData($("#portal-form"));
  const email = String(fd.get("email") || "")
    .trim()
    .toLowerCase();
  state.portal = {
    ...state.portal,
    name: emailName(email),
    email,
    role: fd.get("role"),
    groups: fd.getAll("groups"),
    teams: fd.getAll("teams"),
    vouchers: fd.getAll("vouchers"),
  };
  return state.portal;
};
portalReview = function () {
  const p = state.portal;
  if ($("#portal-form") && (!p.vouchers.length || !p.teams.length)) {
    $("#portal-error").textContent =
      "Choose at least one Voucher and one Team before reviewing.";
    return;
  }
  state.modal = "portal-review";
  openModal(
    "Invite Portal User",
    "Choose what this person can access. They will be able to sign in to the portal.",
    `<section class="portal-review-summary" data-spec="portal.invite.review" data-spec-label="Invitation review"><h3>Summary</h3><p>${esc(reachSentence(p))}</p><div class="review-detail"><dl class="summary-data">${[
      ["Email", p.email],
      ["Role", p.role],
      ["Admin Groups", p.groups.join(", ")],
      ["Voucher access", p.vouchers.join(", ")],
      ["Team access", p.teams.join(", ")],
    ]
      .map(([l, v]) => `<div><dt>${l}</dt><dd>${esc(v)}</dd></div>`)
      .join(
        "",
      )}</dl><div class="review-permissions">${permissionLists(p.role, p.groups)}</div></div></section><label class="check consent" data-spec="portal.invite.consent" data-spec-label="Consent checkbox"><input id="send-consent" type="checkbox"><span>I confirm this person may be granted portal access with the role and scope shown above under our ${termLink}.<strong>Required</strong></span></label>`,
    `<div class="actions">${btn("Back to Role and Access", "portal-back", "text")}${btn("Send Invitation", "portal-send", "primary", 'id="send-button" disabled')}</div>`,
    steps("Role and Access", "Review & Send", 2),
  );
};
const oldInvite = invite;
invite = function () {
  state.profileOpen = false;
  state.actionsOpen = false;
  state.rowMenu = null;
  oldInvite();
};
const originalPortalSend = portalSend;
portalSend = function () {
  if (!$("#send-consent")?.checked) return;
  originalPortalSend();
  if (state.modal === "success") {
    state.modal = "portal-success";
    openModal(
      "",
      "",
      `<div class="success-icon">${icon("check")}</div><h2>Invite sent</h2><p>They will appear in Portal users as Pending invite until they accept and sign in.</p>`,
      `<div class="actions">${btn("Done", "finish-portal", "primary")}</div>`,
      "",
      true,
    );
  }
};
function studentEntryValues() {
  const f = $("#student-form");
  if (!f) return { ...state.studentEntry };
  const fd = new FormData(f);
  return {
    email: String(fd.get("email") || "")
      .trim()
      .toLowerCase(),
    voucher: fd.get("voucher") || "",
    group: fd.get("group") || "",
    team: fd.get("team") || "",
  };
}
function savedStudentRow(d, i) {
  return `<div class="student-draft" data-spec="students.add.saved" data-spec-label="Saved student row"><span class="row-step complete">${icon("check")}</span><div class="draft-columns">${[
    ["Student email", d.email],
    ["Voucher", d.voucher],
    ["Admin Group", d.group || "Unassigned"],
    ["Team", d.team || "Unassigned"],
  ]
    .map(([l, v]) => `<div><span>${l}</span><strong>${esc(v)}</strong></div>`)
    .join(
      "",
    )}</div><div class="draft-actions"><button class="text-action" data-action="draft-delete" data-index="${i}">Delete</button><button class="text-action blue" data-action="draft-edit" data-index="${i}">Edit</button></div></div>`;
}
studentForm = function (editIndex = null) {
  if (state.modal === "student-review" && editIndex === null)
    state.entryOpen = false;
  if (state.modal === "student-detail")
    state.studentEntry = studentEntryValues();
  state.modal = "student-detail";
  state.editing = editIndex;
  if (editIndex !== null) {
    state.entryOpen = true;
    state.studentEntry = { ...state.drafts[editIndex] };
  }
  if (!state.drafts.length) state.entryOpen = true;
  const s = state.studentEntry;
  openModal(
    "Add students",
    "Add each student and choose where their training is funded and managed.",
    `<div class="note student-note">${icon("info")}<span>Students receive an email invitation but do not get access to this portal. All fields marked required must be completed for each student.</span></div>${state.drafts
      .filter((_, i) => i !== editIndex)
      .map((d) => savedStudentRow(d, state.drafts.indexOf(d)))
      .join(
        "",
      )}${state.entryOpen ? `<form id="student-form" class="student-entry" data-spec="students.add.entry" data-spec-label="Student entry row"><span class="row-step">${editIndex === null ? state.drafts.length + 1 : editIndex + 1}</span><div class="entry-fields"><div class="field"><label for="student-email">Email Address <span class="required">*</span></label><input id="student-email" name="email" type="email" required value="${esc(s.email || "")}" placeholder="Enter student’s email"></div><div class="field"><label for="student-voucher">Voucher <span class="required">*</span></label><select id="student-voucher" name="voucher" required>${opts(VOUCHERS, s.voucher)}</select><p class="hint">Pays for their training.</p></div><div class="field"><label for="student-group">Admin Group</label><select id="student-group" name="group" ${s.voucher ? "" : "disabled"}>${groupOptions(s.voucher, s.group)}</select><p class="hint" id="student-group-hint">${s.voucher ? "Optional · filtered by voucher." : "Choose a voucher first."}</p></div><div class="field"><label for="student-team">Team</label><select id="student-team" name="team">${opts(db.teams, s.team, "Leave unassigned")}</select><p class="hint">Optional · teams can mix vouchers.</p></div></div><div id="student-linked">${linkedNote(s.email, "student")}</div><div class="entry-bottom"><p id="account-status" class="account-status ${accountClass(s.email, "student")}">${accountStatus(s.email, "student")}</p><label class="check"><input type="checkbox" id="reuse-assignments" ${state.reuseAssignments ? "checked" : ""}>Use these assignments for the next student</label><button class="button primary" type="submit">Save student</button></div><p class="inline-error" id="student-error" role="alert"></p></form>` : ""}<button class="add-another" data-action="student-add-another">${icon("users")}Add Another</button>`,
    `<span class="secondary">${state.drafts.length} ${state.drafts.length === 1 ? "student" : "students"} ready to review</span><div class="actions">${btn("Cancel", "close-modal", "text")}${btn("Save", "student-review", "primary", state.drafts.length ? "" : "disabled")}</div>`,
    steps("Add student details", "Review & Send", 1),
  );
};
saveStudent = function () {
  const d = { ...studentEntryValues(), id: uid() };
  d.name = emailName(d.email);
  d.workRole = "SOC Analyst I";
  const others = state.drafts.filter((_, i) => i !== state.editing);
  const errors = validateCandidate(d, db.users, others, db);
  if (errors.length) {
    $("#student-error").textContent = errors.join(". ");
    return;
  }
  if (state.editing === null) state.drafts.push(d);
  else state.drafts[state.editing] = d;
  const keep = state.reuseAssignments
    ? { voucher: d.voucher, group: d.group, team: d.team }
    : {};
  state.studentEntry = keep;
  state.entryOpen = false;
  state.editing = null;
  state.modal = "student-saved";
  studentForm();
};
studentReview = function () {
  if ($("#student-form")) {
    const entry = studentEntryValues();
    if (entry.email) {
      $("#student-error").textContent =
        "Save this student before continuing to review.";
      $("#student-email").focus();
      return;
    }
    state.studentEntry = entry;
  }
  if (!state.drafts.length) return;
  state.modal = "student-review";
  openModal(
    "Add students",
    "Review the details and confirm that these people can be invited.",
    `<p class="review-intro" data-spec="students.add.review" data-spec-label="Students review step">Check each student’s details before sending. You can return to make changes without losing your work.</p>${studentReviewTable(state.drafts)}<label class="check consent"><input id="send-consent" type="checkbox"><span>I confirm these people are employees or contractors of our organisation and may be invited under our ${termLink}.<strong>Required</strong></span></label>`,
    `<span class="secondary">${state.drafts.length} ${state.drafts.length === 1 ? "student will" : "students will"} receive an invitation email</span><div class="actions">${btn("Back", "student-back", "text")}${btn("Send invitations", "student-send", "primary", 'id="send-button" disabled')}</div>`,
    steps("Add student details", "Review & Send", 2),
  );
};
function studentReviewTable(rows, results = false) {
  return `<div class="table-wrap student-review-table"><table><colgroup><col style="width:24%"><col style="width:23%"><col style="width:22%"><col style="width:21%"><col style="width:10%"></colgroup><thead><tr><th>Name</th><th>Voucher</th><th>Admin Group</th><th>Team</th><th></th></tr></thead><tbody>${rows.map((d, i) => `<tr><td><strong>${esc(d.email)}</strong>${results && d.result === "failed" ? '<p class="row-error">Invitation could not be saved</p>' : ""}${d.result === "account" || (!results && !accountLinked(d.email) && !linkedPerson(d.email, "portal")) ? '<p class="secondary account-pending">No SANS account · invited to create one</p>' : ""}${!results && linkedPerson(d.email, "portal") ? `<p class="secondary">Also a portal user</p>` : ""}</td><td>${esc(d.voucher)}</td><td class="${d.group ? "" : "unassigned"}">${esc(d.group || "Unassigned")}</td><td class="${d.team ? "" : "unassigned"}">${esc(d.team || "Unassigned")}</td><td>${results ? (d.result === "sent" || d.result === "account" ? `<span class="result-check">${icon(d.result === "account" ? "mail" : "check")}</span>` : d.result === "failed" ? `<button class="result-failure" data-action="retry-student" data-index="${i}" aria-label="Correct failed invitation for ${esc(d.email)}">${icon("info")}</button>` : '<span class="spinner" aria-label="Sending"></span>') : `<div class="draft-actions"><button class="text-action" data-action="review-draft-delete" data-index="${i}">Delete</button><button class="text-action blue" data-action="draft-edit" data-index="${i}">Edit</button></div>`}</td></tr>`).join("")}</tbody></table></div>`;
}
function renderStudentResults() {
  const rows = state.sendResults,
    sent = rows.filter(
      (r) => r.result === "sent" || r.result === "account",
    ).length,
    accounts = rows.filter((r) => r.result === "account").length,
    pending = rows.some((r) => r.result === "sending"),
    failed = rows.filter((r) => r.result === "failed").length;
  state.modal = "student-results";
  openModal(
    "Add students",
    "Review the details and confirm that these people can be invited.",
    `<div class="note success result-banner" data-spec="students.add.results" data-spec-label="Sending results">${icon("check")}<div><strong>${sent} of ${rows.length} invitations sent</strong><p>${pending ? "Sending invitations. Please wait." : failed ? `Successful students have been emailed. ${failed === 1 ? "One invitation needs" : failed + " invitations need"} your attention below.` : accounts ? `Your students have been invited. ${accounts === 1 ? "One person needs" : accounts + " people need"} to create a SANS account first. They will be added automatically once it is set up.` : "Your students have been invited successfully."}</p></div></div>${studentReviewTable(rows, true)}`,
    `<span class="secondary">Your successful invitations are now listed on the <button class="button-link" data-action="view-invitations">Invitations</button> page.</span><div class="actions">${btn("Close", "close-modal", "text", pending ? "disabled" : "")}${pending ? btn('<span class="spinner"></span>Sending invitations', "noop", "primary", "disabled") : failed ? btn("Review failed invitations", "retry-all-students", "primary") : btn("Done", "finish-students", "primary")}</div>`,
    steps("Add student details", "Review & Send", 2),
  );
}
studentSend = function () {
  if (!$("#send-consent")?.checked) return;
  const drafts = state.drafts;
  const errors = drafts.flatMap((d) =>
    validateCandidate(d, db.users, drafts, db),
  );
  if (errors.length) {
    toast("Check duplicate emails before sending.");
    return;
  }
  state.sendResults = drafts.map((d) => ({ ...d, result: "sending" }));
  state.drafts = [];
  renderStudentResults();
  const run = (state.sendRun || 0) + 1;
  state.sendRun = run;
  state.sendResults.forEach((d, i) =>
    setTimeout(
      () => {
        if (state.sendRun !== run) return;
        d.result =
          accountLinked(d.email) || linkedPerson(d.email, "portal")
            ? "sent"
            : "account";
        if (d.result !== "failed") {
          const ok = dispatch((st) => st.addStudent(toStudentInput(d)));
          if (!ok) d.result = "failed";
        }
        if (state.modal === "student-results") renderStudentResults();
      },
      500 + i * 450,
    ),
  );
};
closeModal = function () {
  if (
    state.modal === "student-results" &&
    state.sendResults.some((r) => r.result === "sending")
  ) {
    toast("Please wait for the simulated invitations to finish.");
    return;
  }
  if (state.modal === "discard") {
    state.modal = "student-resume";
    studentForm();
    return;
  }
  if (state.modal === "student-detail" || state.modal === "student-review") {
    const e = studentEntryValues();
    state.studentEntry = e;
    if (state.drafts.length || e.email) {
      state.modal = "discard";
      openModal(
        "Discard this draft?",
        "These students have not been added yet.",
        "<p>Your existing student records will be kept. Only this unsent draft will be discarded.</p>",
        `<div class="actions">${btn("Keep editing", "keep-draft")}${btn("Discard draft", "discard-draft", "danger")}</div>`,
        "",
        true,
      );
      return;
    }
  }
  if (state.modal === "upload" || state.modal === "uploading") {
    state.uploadToken = (state.uploadToken || 0) + 1;
    state.upload = null;
  }
  if (state.modal === "terms" && state.returnFromTerms) {
    const back = state.returnFromTerms;
    state.returnFromTerms = null;
    back();
    return;
  }
  $("#modal").close();
  state.modal = null;
  state.editing = null;
};
// Upload step: say what goes in each column up front, then check the file the moment
// it lands and say what was found before the admin commits to reviewing it.
function csvColumnGuide() {
  const list = (items) => items.map((x) => `<span class="value-chip">${esc(x)}</span>`).join("");
  const vouchers = db.vouchers?.length ? db.vouchers : VOUCHERS;
  return `<details class="csv-guide" data-spec="csv.column-guide" data-spec-label="Column guide"><summary>${icon("info")}<span>What goes in each column</span>${icon("arrow_drop_down")}</summary><div class="csv-guide-body"><table class="csv-guide-table"><tbody>
<tr><th scope="row">Email <span class="req">Required</span></th><td>Their work email. This is how we match them to a SANS account.</td></tr>
<tr><th scope="row">Name</th><td>First and last name. Separate First name and Last name columns work too.</td></tr>
<tr><th scope="row">Voucher</th><td>Pays for their training. Leave it blank to assign one after upload; they won't be invited until you do.<div class="value-list">${list(vouchers)}</div></td></tr>
<tr><th scope="row">Admin group</th><td>Optional. It must be one the voucher covers.<div class="value-list">${list(db.groups || GROUPS)}</div></td></tr>
<tr><th scope="row">Team</th><td>Optional.<div class="value-list">${list(db.teams || TEAMS)}</div></td></tr>
<tr><th scope="row">Work role</th><td>Optional, for example SOC Analyst I.</td></tr>
</tbody></table><p class="csv-guide-foot">Extra columns are ignored. Up to 500 students per file.</p></div></details><p class="csv-guide-hint">Only email is required. Column order doesn't matter.</p>`;
}
// The column guide opens and closes by animating its height, so the dialog grows and shrinks with it
// instead of jumping. Interrupting mid-way reverses from wherever it has got to.
document.addEventListener("click", (event) => {
  const summary = event.target.closest(".csv-guide > summary");
  if (!summary || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  event.preventDefault();
  const details = summary.parentElement;
  const body = details.querySelector(".csv-guide-body");
  const opening = !details.classList.contains("is-open");
  const from = details.open ? body.getBoundingClientRect().height : 0;
  body.getAnimations().forEach((a) => a.cancel());
  details.classList.toggle("is-open", opening);
  details.open = true;
  const to = opening ? body.scrollHeight : 0;
  const animation = body.animate(
    [
      { height: `${from}px`, opacity: opening ? 0 : 1 },
      { height: `${to}px`, opacity: opening ? 1 : 0 },
    ],
    { duration: opening ? 420 : 280, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
  );
  animation.onfinish = () => {
    if (!opening) details.open = false;
    else details.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };
});
const PROBLEM_LABELS = {
  invalid_email: ["invalid email", "invalid emails"],
  duplicate_email: ["duplicate in this file", "duplicates in this file"],
  already_student: ["already a student", "already students"],
  unknown_voucher: ["voucher not recognised", "vouchers not recognised"],
  unknown_group: ["admin group not recognised", "admin groups not recognised"],
  group_not_covered: ["admin group outside its voucher", "admin groups outside their voucher"],
  unknown_team: ["team not recognised", "teams not recognised"],
};
function csvSummary(u) {
  const c = precheckImport(u.rows);
  const tile = (kind, iconName, count, title, detail, chip) =>
    count
      ? `<button type="button" class="csv-tile ${kind}" data-action="csv-continue" data-chip="${chip}"><span class="csv-tile-icon">${icon(iconName)}</span><span class="csv-tile-text"><strong>${count} ${title}</strong>${detail ? `<span>${detail}</span>` : ""}</span>${icon("arrow_forward")}</button>`
      : "";
  const problemText = Object.entries(c.problems)
    .sort((x, y) => y[1] - x[1])
    .map(([code, n]) => `${n} ${(PROBLEM_LABELS[code] || [code, code])[n === 1 ? 0 : 1]}`)
    .join(" · ");
  const readyNotes = [
    c.newAccount ? `${c.newAccount} will be asked to create a SANS account` : "",
    c.alsoPortal ? `${c.alsoPortal} already ${c.alsoPortal === 1 ? "has" : "have"} portal access` : "",
  ].filter(Boolean).join(" · ");
  const columns = `<div class="csv-columns"><p>${icon("check")}<span><strong>Columns matched:</strong> ${u.matched.map((m) => esc(m.label)).join(", ")}</span></p>${u.ignored.length ? `<p class="muted-line">${icon("info")}<span><strong>Ignored:</strong> ${u.ignored.map(esc).join(", ")}</span></p>` : ""}${u.missing.includes("Voucher") ? `<p class="warn-line">${icon("info")}<span>No voucher column, so everyone will need a voucher assigned before they're invited.</span></p>` : ""}</div>`;
  return `<div class="csv-summary" data-spec="csv.summary" data-spec-label="Upload summary"><h3 tabindex="-1">${pluralize(c.total, "student")} found</h3><div class="csv-tiles">${tile("ready", "check_circle", c.ready, "ready to invite", readyNotes, "ready")}${tile("needs", "error", c.needsVoucher, c.needsVoucher === 1 ? "needs a voucher" : "need a voucher", "Add them now and assign a voucher on the next screen", "needsVoucher")}${tile("error", "error", c.error, c.error === 1 ? "needs fixing" : "need fixing", esc(problemText), "error")}</div>${columns}</div>`;
}
function uploadDisplay() {
  state.modal = state.upload?.phase === "uploading" ? "uploading" : "upload";
  const u = state.upload;
  const ready = u?.phase === "ready";
  const total = u?.rows?.length || 0;
  const fileRow = u?.fileName
    ? `<div class="csv-file-row ${ready ? "is-ready" : "is-checking"}">${csvIcon()}<div class="csv-file-detail"><strong>${esc(u.fileName)}</strong><p>${esc(u.sizeLabel)} <span class="file-divider">|</span> ${ready ? `<span class="file-done">${icon("check")}</span> Checked` : `Checking ${pluralize(total, "row")}…`}</p>${ready ? "" : `<div class="csv-progress" role="progressbar" aria-label="Checking file" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${u.progress}"><div style="width:${u.progress}%"></div></div>`}</div><button class="icon-btn" data-action="remove-upload" aria-label="Remove ${esc(u.fileName)} and choose another file">${icon("close")}</button></div>`
    : "";
  const template = `<button class="button-link csv-template-link" data-action="csv-template">${CSV_FILE_ICON}<span>Download a template</span></button>`;
  const error = u?.error
    ? `<div class="csv-upload-error" role="alert">${icon("error")}<div><strong>${esc(u.errorTitle || "We couldn't read that file")}</strong><p>${esc(u.error)}</p></div></div>`
    : "";
  const zone = `<div class="upload-zone" id="csv-dropzone" data-spec="csv.dropzone" data-spec-label="Upload drop zone"><label for="csv-file" class="upload-visual"><span class="upload-featured-icon">${UPLOAD_CLOUD_ICON}</span><span><strong>Click to upload</strong> or drag and drop</span><small>csv files only</small></label><input type="file" id="csv-file" accept=".csv,text/csv,.xlsx,.xls" aria-label="Choose a CSV file"></div>`;
  openModal(
    "Import students from a CSV",
    "",
    u?.fileName ? `${fileRow}${ready ? csvSummary(u) : ""}` : `${template}${error}${zone}${csvColumnGuide()}`,
    `<div class="actions">${btn("Cancel", "close-modal")}${btn(ready ? `Review ${pluralize(total, "student")}` : "Continue", "csv-continue", "primary", ready ? "" : "disabled")}</div>`,
  );
  // openModal focuses the first input, which here is the hidden file input and lights up the whole drop zone.
  // Start on the template link instead; Tab still reaches the drop zone next.
  if (!u?.fileName) setTimeout(() => $("#modal .csv-template-link")?.focus({ focusVisible: false }), 0);
}
uploadForm = function (error = "", errorTitle = "") {
  state.uploadToken = (state.uploadToken || 0) + 1;
  state.upload = error ? { error, errorTitle } : null;
  state.menu = false;
  render();
  uploadDisplay();
};
stageCSV = function (text, name, size) {
  if (/\.xlsx?$/i.test(name)) {
    uploadForm("In Excel, choose File → Save a copy → CSV UTF-8 (comma delimited), then upload the .csv file.", "That's an Excel file");
    return;
  }
  if (!/\.csv$/i.test(name)) {
    uploadForm("Choose a file that ends in .csv. You can save one from Excel, Numbers or Google Sheets.", "That isn't a CSV file");
    return;
  }
  let parsed;
  try {
    parsed = readStudentCSV(text);
  } catch (e) {
    uploadForm(e.message);
    return;
  }
  state.uploadToken = (state.uploadToken || 0) + 1;
  const token = state.uploadToken;
  const bytes = size ?? new Blob([text]).size;
  state.upload = {
    fileName: name,
    sizeLabel: bytes > 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${bytes} bytes`,
    progress: 15,
    phase: "uploading",
    rows: parsed.rows,
    matched: parsed.matched,
    ignored: parsed.ignored,
    missing: parsed.missing,
  };
  uploadDisplay();
  // The file input has just been replaced, so give focus somewhere useful while the check runs.
  $("#modal [data-action='remove-upload']")?.focus();
  // Progress updates touch only the bar, so whatever has focus keeps it.
  setTimeout(() => {
    if (token !== state.uploadToken) return;
    state.upload.progress = 70;
    const bar = $("#modal .csv-progress");
    bar?.setAttribute("aria-valuenow", "70");
    if (bar?.firstElementChild) bar.firstElementChild.style.width = "70%";
  }, 250);
  // The result replaces the dialog body: move focus to its heading so screen readers read
  // "N students found", and keyboard users continue from the result.
  setTimeout(() => {
    if (token !== state.uploadToken) return;
    state.upload.progress = 100;
    state.upload.phase = "ready";
    uploadDisplay();
    $("#modal .csv-summary h3")?.focus();
  }, 700);
};
importErrors = function (row) {
  if (row.saved) return [];
  const errors = validateCandidate(
    row,
    db.users,
    state.staged.filter((r) => !r.saved),
    db,
  );
  return errors;
};
function importStateCell(row) {
  const e = importErrors(row);
  return e.length
    ? `<span class="row-error">${e.map(esc).join("<br>")}</span>`
    : !row.saved &&
        validEmail(row.email) &&
        !accountLinked(row.email) &&
        !linkedPerson(row.email, "portal")
      ? `<span class="result-check" title="Ready · will be invited to create a SANS account" aria-label="Ready, will be invited to create a SANS account">${icon("mail")}</span><span class="secondary account-pending">New SANS account</span>`
      : `<span class="result-check" title="${row.saved ? "Added to database" : "Ready to add"}" aria-label="${row.saved ? "Added to database" : "Ready to add"}">${icon("check")}</span>`;
}
function assignLink(r, i, kind, label, value) {
  return `<button class="inline-assignment ${value ? "assigned" : ""}" data-action="open-picker" data-kind="${kind}" data-index="${i}" ${r.saved ? "disabled" : ""}>${!value && kind === "voucher" ? `<span class="error-icon">${icon("info")}</span>` : ""}${esc(value || label)}</button>`;
}
importView = function () {
  const invalid = state.staged.filter((r) => importErrors(r).length);
  const rows = ordered(state.staged.filter((r) => matchesFilters(r, true)));
  const valid = state.staged.filter(
    (r) => !r.saved && !importErrors(r).length,
  ).length;
  return `<button class="back" data-action="import-cancel">${icon("back")}Back</button>${heading("Review Students", "", btn("Done", "fidelity-import-done", "primary"))}<section class="card import-card">${toolbar(true)}${invalid.length && !state.importAlertDismissed ? `<div class="note warning import-alert"><span class="alert-icon">${icon("info")}</span><div><strong>${invalid.length} ${invalid.length === 1 ? "user could" : "users could"} not be added</strong><ul>${invalid.some((r) => !r.voucher) ? `<li>${invalid.filter((r) => !r.voucher).length} ${invalid.filter((r) => !r.voucher).length === 1 ? "student requires" : "students require"} a Voucher</li>` : ""}${invalid.some((r) => importErrors(r).some((e) => /not covered/.test(e))) ? `<li>${invalid.filter((r) => importErrors(r).some((e) => /not covered/.test(e))).length} admin group ${invalid.filter((r) => importErrors(r).some((e) => /not covered/.test(e))).length === 1 ? "assignment is" : "assignments are"} outside the chosen voucher</li>` : ""}${invalid.some((r) => importErrors(r).some((e) => !/voucher/i.test(e))) ? "<li>Check invalid or duplicate student details</li>" : ""}</ul><div class="alert-actions"><button data-action="dismiss-import-alert">Dismiss</button><button data-action="show-import-errors">${state.onlyErrors ? "Show all users" : "Show users"}</button></div></div><button class="icon-btn alert-close" data-action="dismiss-import-alert" aria-label="Dismiss import summary">${icon("close")}</button></div>` : ""}<div class="table-wrap"><table class="csv-review-table"><colgroup><col class="col-check"><col style="width:21%"><col style="width:16%"><col style="width:16%"><col style="width:16%"><col style="width:18%"><col style="width:8%"><col class="col-menu"></colgroup><thead><tr><th class="selection-col">${checkRow("all", allSelected(rows), "Select all visible import rows")}</th>${tableHead("Name", "name")}${tableHead("Role", "workRole", false)}${tableHead("Voucher", "voucher", false)}${tableHead("Admin Groups", "group", false)}${tableHead("Team", "team", false)}${tableHead("Status", "status", false)}<th></th></tr></thead><tbody>${
    rows
      .map((r) => {
        const i = state.staged.indexOf(r);
        return `<tr><td class="selection-col">${checkRow(r.id, state.selected.includes(r.id), "Select " + r.email)}</td><td><button class="name-edit" data-action="edit-import" data-index="${i}">${r.name ? `<strong>${esc(r.name)}</strong>` : ""}<span>${esc(r.email)}</span></button></td><td>${assignLink(r, i, "workRole", "Add work role", r.workRole)}</td><td>${assignLink(r, i, "voucher", "Add Voucher", r.voucher)}</td><td>${assignLink(r, i, "group", "Add Admin Group", r.group)}</td><td>${assignLink(r, i, "team", "Add to Team", r.team)}</td><td>${importStateCell(r)}</td><td class="menu-cell"><button class="icon-btn kebab" data-action="edit-import" data-index="${i}" aria-label="Edit import row ${i + 1}">${menuIcon()}</button></td></tr>`;
      })
      .join("") ||
    `<tr><td colspan="8"><div class="empty"><h2>No matching students</h2>${btn("Clear filters", "all-filters-clear")}</div></td></tr>`
  }</tbody></table></div><span class="sr-only">${valid} ${valid === 1 ? "student" : "students"} ready to add, ${invalid.length} need attention</span></section>`;
};
function pickerItems(kind) {
  return kind === "voucher"
    ? VOUCHERS
    : kind === "group"
      ? pickerGroups()
      : kind === "team"
        ? db.teams
        : [
            "Security Program Lead",
            "SOC Analyst I",
            "SOC Analyst II",
            "Cloud Security Engineer",
            "ICS/OT Security Engineer",
          ];
}
function pickerTitle(kind) {
  return {
    voucher: "Add Voucher",
    group: "Add Admin Group",
    team: "Add to team",
    workRole: "Add work role",
  }[kind];
}
function openPicker(kind, index = null, bulk = false) {
  const r = index === null ? null : state.staged[index];
  state.picker = { kind, index, bulk, value: r?.[kind] || "", search: "" };
  showPicker();
}
function showPicker() {
  state.modal = "picker";
  const p = state.picker;
  const items = pickerItems(p.kind).filter((x) =>
    x.toLowerCase().includes(p.search.toLowerCase()),
  );
  openModal(
    pickerTitle(p.kind),
    "",
    `<div class="search picker-search">${icon("search")}<input id="picker-search" placeholder="Search" aria-label="Search ${esc(pickerTitle(p.kind).toLowerCase())}" value="${esc(p.search)}"></div><div class="picker-list" role="listbox" aria-label="${esc(pickerTitle(p.kind))}">${items.map((x) => `<button role="option" aria-selected="${p.value === x}" class="picker-option ${p.value === x ? "selected" : ""}" data-action="picker-select" data-value="${esc(x)}">${esc(x)}</button>`).join("") || '<p class="empty-options">No matches found</p>'}</div>`,
    `<div class="picker-footer">${p.kind === "team" ? btn("Create a new team", "picker-create-team") : ""}${btn("Done", "picker-save", "primary", p.value ? "" : "disabled")}</div>`,
  );
}
function savePicker() {
  const p = state.picker;
  if (!p.value) return;
  const rows = p.bulk
    ? state.staged.filter((r) => state.selected.includes(r.id) && !r.saved)
    : [state.staged[p.index]];
  rows.forEach((r) => {
    if (r) r[p.kind] = p.value;
  });
  $("#modal").close();
  state.modal = null;
  state.actionsOpen = false;
  state.importAlertDismissed = false;
  render();
}
function finishImport() {
  const valid = state.staged.filter((r) => !r.saved && !importErrors(r).length);
  if (
    valid.length &&
    !dispatch(
      (st) => st.commitCsvImport(valid.map(toStudentInput)),
      `${valid.length} students added`,
    )
  )
    return;
  valid.forEach((r) => (r.saved = true));
  const invalid = state.staged.filter(
    (r) => !r.saved && importErrors(r).length,
  );
  if (invalid.length) {
    state.modal = "finish-import";
    openModal(
      "Some students need attention",
      `${valid.length} students added. ${invalid.length} could not be added.`,
      "<p>Keep reviewing to correct the remaining records, or finish with those records excluded.</p>",
      `<div class="actions">${btn("Keep reviewing", "close-modal")}${btn("Finish", "leave-import", "primary")}</div>`,
      "",
      true,
    );
    render();
  } else {
    state.staged = [];
    navigate("students");
  }
}
function confirmBulkDelete() {
  state.modal = "bulk-delete";
  openModal(
    "Delete selected demo records?",
    `${state.selected.length} records selected.`,
    "<p>Only the selected mock records in this browser will be removed.</p>",
    `<div class="actions">${btn("Cancel", "close-modal")}${btn("Delete records", "confirm-bulk-delete", "danger")}</div>`,
    "",
    true,
  );
}
function profileData() {
  state.profileOpen = false;
  dataModal();
  const actions = $("#modal .data-actions");
  if (actions)
    actions.insertAdjacentHTML(
      "beforeend",
      btn("Use sample CSV", "demo-sample"),
    );
}
document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const a = target.dataset.action,
    id = target.dataset.id,
    index = Number(target.dataset.index);
  try {
    switch (a) {
      case "profile-menu":
        state.profileOpen = !state.profileOpen;
        render();
        break;
      case "sign-in-as": {
        const personId = target.dataset.personId;
        const person = db.users.find(
          (user) => user.type === "portal" && user.personId === personId,
        );
        state.profileOpen = false;
        setSansStaff(null);
        if (SANS_VIEWS.includes(state.view)) state.view = "home";
        dispatch(
          (st) => st.setActor(personId),
          `Signed in as ${person?.name || "portal user"}`,
        );
        break;
      }
      case "sign-in-as-sans": {
        // SANS staff work in the organization with full Admin rights, so changes in the organization's
        // pages run as its first Admin.
        const staff = SANS_STAFF.find((member) => member.id === target.dataset.staffId);
        const admin = db.users.find((user) => user.type === "portal" && user.role === "Admin") || signedInPortalUser();
        state.profileOpen = false;
        setSansStaff(staff.id);
        dispatch(
          (st) => st.setActor(admin.personId),
          `Signed in as ${staff.name}, ${staff.role}`,
        );
        break;
      }
      case "toggle-people":
        state.hidePeople = !state.hidePeople;
        render();
        break;
      case "toggle-groups":
        state.hideGroups = !state.hideGroups;
        render();
        break;
      case "toggle-nav-group": {
        // Toggled in place rather than re-rendered, so the CSS slide runs. When the group holds the current
        // page, the selected state moves between the parent and that child.
        const key = target.dataset.group,
          open = !state.navOpen.includes(key),
          list = document.getElementById(`nav-group-${key}`),
          current = list?.querySelector(`[data-view="${navView()}"]`);
        state.navOpen = open ? [...state.navOpen, key] : state.navOpen.filter((k) => k !== key);
        if (!list) {
          render();
          break;
        }
        target.setAttribute("aria-expanded", String(open));
        list.dataset.open = String(open);
        list.inert = !open;
        if (current) {
          target.classList.toggle("active", !open);
          current.classList.toggle("active", open);
          if (open) current.setAttribute("aria-current", "page");
          else current.removeAttribute("aria-current");
        }
        if (typeof followNavBar === "function") followNavBar(open ? 340 : 240);
        break;
      }
      case "toggle-actions":
        state.actionsOpen = !state.actionsOpen;
        state.rowMenu = null;
        render();
        break;
      case "row-menu":
        state.rowMenu = state.rowMenu === id ? null : id;
        state.actionsOpen = false;
        render();
        break;
      case "sort":
        state.sortDirection =
          state.sort === target.dataset.key ? -state.sortDirection : 1;
        state.sort = target.dataset.key;
        render();
        break;
      case "all-filters-clear":
        state.search =
          state.role =
          state.status =
          state.team =
          state.group =
          state.voucher =
            "";
        state.onlyErrors = false;
        render();
        break;
      case "set-user-status":
        dispatch(
          (st) => st.changeStatus(id, target.dataset.status),
          "Status updated",
        );
        state.rowMenu = null;
        render();
        break;
      case "resend-user":
        dispatch((st) => st.resendInvite(id), "Invitation resent in this demo");
        state.rowMenu = null;
        render();
        break;
      case "bulk-status":
        dispatch(
          (st) => st.bulkStatus(state.selected, target.dataset.status),
          "Selected records updated",
        );
        state.actionsOpen = false;
        render();
        break;
      case "bulk-resend":
        dispatch(
          (st) => st.bulkResend(state.selected),
          "Pending invitations resent in this demo",
        );
        state.actionsOpen = false;
        render();
        break;
      case "bulk-delete":
        confirmBulkDelete();
        break;
      case "confirm-bulk-delete":
        if (
          dispatch((st) => st.archivePeople(state.selected), "Records deleted")
        ) {
          state.selected = [];
          state.actionsOpen = false;
          $("#modal").close();
          state.modal = null;
          render();
        }
        break;
      case "student-add-another":
        if ($("#student-form") && studentEntryValues().email) {
          $("#student-error").textContent =
            "Save this student before adding another.";
          return;
        }
        state.entryOpen = true;
        state.modal = "student-new";
        studentForm();
        break;
      case "review-draft-delete":
        state.drafts.splice(index, 1);
        if (state.drafts.length) studentReview();
        else {
          state.studentEntry = {};
          studentForm();
        }
        break;
      case "retry-student":
      case "retry-all-students":
        state.drafts = state.sendResults
          .filter((r) => r.result === "failed")
          .map((r) => {
            const copy = { ...r };
            delete copy.result;
            return copy;
          });
        state.studentEntry = {};
        state.entryOpen = false;
        state.modal = "student-retry";
        studentForm(
          a === "retry-student"
            ? Math.max(
                0,
                state.drafts.findIndex(
                  (d) => d.id === state.sendResults[index].id,
                ),
              )
            : 0,
        );
        break;
      case "view-invitations":
        $("#modal").close();
        state.modal = null;
        navigate("students");
        state.status = "Pending invite";
        render();
        break;
      case "demo-sample":
        state.profileOpen = false;
        navigate("students");
        stageCSV(SAMPLE, "SANS-training-members.csv", 204800);
        break;
      case "remove-upload":
        uploadForm();
        break;
      case "csv-continue":
        if (state.upload?.phase === "ready") {
          state.staged = state.upload.rows;
          state.upload = null;
          state.importAlertDismissed = false;
          $("#modal").close();
          state.modal = null;
          navigate("import");
        }
        break;
      case "open-picker":
        openPicker(target.dataset.kind, index);
        break;
      case "bulk-picker":
        openPicker(target.dataset.kind, null, true);
        break;
      case "picker-select":
        state.picker.value = target.dataset.value;
        showPicker();
        break;
      case "picker-save":
        savePicker();
        break;
      case "picker-create-team":
        state.returnToPicker = state.picker;
        state.modal = "team";
        openModal(
          "Create a new team",
          "",
          `<form id="picker-team-form"><div class="field"><label for="picker-team-name">Team name</label><input id="picker-team-name" name="name" required></div><p class="inline-error" id="picker-team-error" role="alert"></p></form>`,
          `<div class="actions">${btn("Cancel", "return-picker")}<button class="button primary" form="picker-team-form" type="submit">Create team</button></div>`,
          "",
          true,
        );
        break;
      case "return-picker":
        state.picker = state.returnToPicker;
        showPicker();
        break;
      case "fidelity-import-done":
        finishImport();
        break;
      case "leave-import":
        state.staged = [];
        $("#modal").close();
        state.modal = null;
        navigate("students");
        break;
      case "remove-selected-import":
        state.staged = state.staged.filter(
          (r) => !state.selected.includes(r.id) || r.saved,
        );
        state.selected = [];
        state.actionsOpen = false;
        render();
        break;
      case "dismiss-import-alert":
        state.importAlertDismissed = true;
        render();
        break;
      case "show-import-errors":
        state.onlyErrors = !state.onlyErrors;
        render();
        break;
      case "terms":
        state.returnFromTerms =
          state.modal === "portal-review" ? portalReview : studentReview;
        state.modal = "terms";
        openModal(
          "Terms and conditions",
          "Prototype reference",
          "<p>This is a placeholder for the organisation’s actual invitation terms. No agreement is submitted by this local prototype.</p>",
          `<div class="actions">${btn("Back to review", "close-modal", "primary")}</div>`,
          "",
          true,
        );
        break;
      case "data": {
        state.profileOpen = false;
        const actions = $("#modal .data-actions");
        if (actions && !actions.querySelector('[data-action="demo-sample"]'))
          actions.insertAdjacentHTML(
            "beforeend",
            btn("Use sample CSV", "demo-sample"),
          );
        break;
      }
      case "edit-user":
        state.rowMenu = null;
        state.actionsOpen = false;
        render();
        break;
      case "add-student":
        state.studentEntry = {};
        state.entryOpen = true;
        state.reuseAssignments = false;
        state.modal = "student-new";
        studentForm();
        break;
      case "discard-draft":
        state.studentEntry = {};
        state.entryOpen = true;
        break;
      case "keep-draft":
        state.modal = "student-resume";
        studentForm();
        break;
    }
  } catch (e) {
    toast("The action could not be completed. " + e.message);
  }
});
document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.dataset.select) {
    let rows =
      state.view === "import"
        ? state.staged.filter((r) => matchesFilters(r, true))
        : db.users.filter(
            (u) =>
              u.type === (state.view === "portal" ? "portal" : "student") &&
              matchesFilters(u),
          );
    if (el.dataset.select === "all")
      state.selected = el.checked
        ? [...new Set([...state.selected, ...rows.map((r) => r.id)])]
        : state.selected.filter((id) => !rows.some((r) => r.id === id));
    else
      state.selected = el.checked
        ? [...new Set([...state.selected, el.dataset.select])]
        : state.selected.filter((id) => id !== el.dataset.select);
    render();
  }
  if (el.id === "all-groups" || el.id === "all-teams") {
    const kind = el.id === "all-groups" ? "groups" : "teams";
    document
      .querySelectorAll(`#portal-form input[name="${kind}"]`)
      .forEach((n) => (n.checked = el.checked));
    const p = readPortal();
    $("#permission-preview").innerHTML = summary(p);
  }
  if (el.id === "reuse-assignments") state.reuseAssignments = el.checked;
});
document.addEventListener("input", (e) => {
  const el = e.target;
  if (el.dataset.scopeSearch) {
    const kind = el.dataset.scopeSearch;
    document
      .querySelectorAll(`[data-scope-list="${kind}"] .scope-choice`)
      .forEach(
        (n) =>
          (n.hidden = !n.dataset.scopeValue.includes(el.value.toLowerCase())),
      );
  }
  if (el.id === "student-email") {
    const email = el.value.trim().toLowerCase();
    $("#account-status").className =
      "account-status " + accountClass(email, "student");
    $("#account-status").innerHTML = accountStatus(email, "student");
    $("#student-linked").innerHTML = linkedNote(email, "student");
  }
  if (el.id === "picker-search") {
    state.picker.search = el.value;
    const term = el.value.toLowerCase();
    $("#modal .picker-list").innerHTML =
      pickerItems(state.picker.kind)
        .filter((x) => x.toLowerCase().includes(term))
        .map(
          (x) =>
            `<button role="option" aria-selected="${state.picker.value === x}" class="picker-option ${state.picker.value === x ? "selected" : ""}" data-action="picker-select" data-value="${esc(x)}">${esc(x)}</button>`,
        )
        .join("") || '<p class="empty-options">No matches found</p>';
  }
});
document.addEventListener("submit", (e) => {
  if (e.target.id !== "picker-team-form") return;
  e.preventDefault();
  const name = new FormData(e.target).get("name").trim();
  if (!name || db.teams.some((t) => t.toLowerCase() === name.toLowerCase())) {
    $("#picker-team-error").textContent = "Enter a unique team name.";
    return;
  }
  if (dispatch((st) => st.createTeam(name), "Team created")) {
    state.picker = state.returnToPicker;
    state.picker.value = name;
    showPicker();
  }
});
document.addEventListener("dragover", (e) => {
  const zone = e.target.closest("#csv-dropzone");
  if (!zone) return;
  e.preventDefault();
  zone.classList.add("dragging");
});
document.addEventListener("dragleave", (e) => {
  const zone = e.target.closest("#csv-dropzone");
  if (zone && !zone.contains(e.relatedTarget))
    zone.classList.remove("dragging");
});
document.addEventListener("drop", async (e) => {
  const zone = e.target.closest("#csv-dropzone");
  if (!zone) return;
  e.preventDefault();
  zone.classList.remove("dragging");
  const f = e.dataTransfer.files[0];
  if (!f) return;
  if (f.size > 2 * 1024 * 1024) {
    uploadForm("Split it into smaller files of up to 500 students and import them one at a time.", "That file is over 2 MB");
    return;
  }
  stageCSV(await f.text(), f.name, f.size);
});
document.addEventListener("click", (e) => {
  if (
    !e.target.closest(".menu-anchor") &&
    (state.rowMenu || state.actionsOpen || state.profileOpen)
  ) {
    state.rowMenu = null;
    state.actionsOpen = false;
    state.profileOpen = false;
    render();
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("#modal").open) {
    state.rowMenu = null;
    state.actionsOpen = false;
    state.profileOpen = false;
    state.menu = false;
    render();
  }
});
document.addEventListener("change", (e) => {
  if (!e.target.closest("#portal-form")) return;
  for (const [name, id] of [
    ["groups", "all-groups"],
    ["teams", "all-teams"],
  ]) {
    const master = document.getElementById(id);
    if (!master) continue;
    const boxes = [
      ...document.querySelectorAll(`#portal-form input[name="${name}"]`),
    ];
    const count = boxes.filter((box) => box.checked).length;
    master.checked = count === boxes.length && count > 0;
    master.indeterminate = count > 0 && count < boxes.length;
  }
});
// Exports follow the current view and selection, including unsaved import rows.
document.addEventListener(
  "click",
  (event) => {
    const button = event.target.closest('[data-action="export-csv"]');
    if (!button) return;
    event.stopImmediatePropagation();
    event.preventDefault();
    const imported = state.view === "import";
    let rows = imported
      ? state.staged.filter((r) => matchesFilters(r, true))
      : db.users.filter(
          (u) =>
            u.type === (state.view === "portal" ? "portal" : "student") &&
            matchesFilters(u),
        );
    if (state.selected.length)
      rows = rows.filter((r) => state.selected.includes(r.id));
    const header = [
      "name",
      "email",
      "role",
      "status",
      "voucher",
      "admin_group",
      "team",
    ];
    const values = rows.map((u) => [
      u.name,
      u.email,
      imported ? u.workRole : u.role,
      imported
        ? u.saved
          ? "Added"
          : importErrors(u).join("; ") || "Ready"
        : u.status,
      imported ? u.voucher : u.vouchers.join("; "),
      imported ? u.group : u.groups.join("; "),
      imported ? u.team : u.teams.join("; "),
    ]);
    download(
      "SANS-" + (imported ? "import-review" : state.view) + ".csv",
      [header, ...values].map((r) => r.map(csvEscape).join(",")).join("\r\n"),
      "text/csv",
    );
    state.actionsOpen = false;
    render();
  },
  true,
);
render();
