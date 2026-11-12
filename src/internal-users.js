// Internal Users: SANS staff who work in the portal on behalf of customers.
// A list (search, role filter, quick chips), a profile per person (details and
// organisation access), and three dialogs: Add SANS employee, Edit access and
// Deactivate (type-to-confirm). Decisions from the 4 Nov 2026 review:
//   - the list drops email, the organisation list, per-org last access and "Why?";
//   - access is changed from the profile's access table (Add to organisation, row menus), and Deactivate sits on the profile, not the list;
//   - organisations link to their Customer Organizations page;
//   - organisations are a multiselect that defaults to SANS, with no "All organisations";
//   - roles offered: Global Admin, SANS Account Admin, SANS Account Viewer, System Admin.
// SANS staff are a separate directory from the customer's people, so this layer keeps
// its own small dataset in browser storage rather than in store.js.
// Loads after teams.js and before motion.js.

var IU_KEY = "sans-internal-users";
var IU_STALE_DAYS = 90;

const IU_ORGS = [
  ["sans", "SANS"],
  ["nwt", "Northwind Traders"],
  ["globex", "Globex Energy"],
  ["arc", "Arcadia Health Systems"],
  ["bel", "Bellweather Logistics"],
  ["cin", "Cinderpeak Mining"],
  ["dra", "Drayton Financial"],
  ["eas", "Eastvale Utilities"],
  ["fai", "Fairmont Rail"],
  ["gre", "Greyloch Insurance"],
  ["har", "Harborline Shipping"],
  ["iro", "Ironvale Manufacturing"],
  ["jun", "Juniper Grove Foods"],
  ["kes", "Kestrel Aerospace"],
  ["lum", "Lumen Pacific Telecom"],
  ["mer", "Meridian Bancorp"],
  ["nor", "Norbury Pharmaceuticals"],
  ["oak", "Oakhaven Municipal"],
  ["pin", "Pinefield Retail Group"],
  ["qua", "Quarrystone Cement"],
  ["red", "Redcliff Media"],
].map(([id, name]) => ({ id, name }));
const IU_ALL = "*";
const IU_TEST = "sandbox";

// `scope` says how a role reaches organisations: picked one by one, every organisation, or the test account only.
const IU_ROLES = [
  { id: "global", name: "Global Admin", scope: "all", offered: true, blurb: "Runs the portal. Reaches every customer organisation." },
  { id: "acctadmin", name: "SANS Account Admin", scope: "pick", offered: true, blurb: "Manages members, roles and teams for chosen organisations. Never approves training or moves funds." },
  { id: "acctviewer", name: "SANS Account Viewer", scope: "pick", offered: true, blurb: "Read-only access to chosen organisations." },
  { id: "sysadmin", name: "System Admin", scope: "test", offered: true, blurb: "Configuration and environments. SANS Test Account only, so no customer data." },
  { id: "curation", name: "Content Curation", scope: "all", offered: false, blurb: "Assigns dashboards and content to organisations." },
];

// ---------- Data ----------
function iuDaysAgo(days, hour = 10, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}
function iuSeed() {
  const sf = (orgs, role, days = 76) => orgs.map((orgId) => ({ orgId, role, source: "salesforce", at: iuDaysAgo(days) }));
  const hand = (orgId, role, by, days, note) => ({ orgId, role, source: "hand", by, at: iuDaysAgo(days), note });
  const acctAdmin = ["nwt", "arc", "bel", "cin", "dra", "eas", "fai", "gre", "har", "iro", "jun", "kes", "lum", "mer", "nor"];
  return [
    { id: "iu-rosa", name: "Rosa Villanueva", email: "rvillanueva@sans.example", job: "Customer Success Manager", status: "active", lastAccess: iuDaysAgo(0, 8, 41), access: sf(acctAdmin, "acctadmin") },
    { id: "iu-declan", name: "Declan Moore", email: "dmoore@sans.example", job: "Customer Success Manager", status: "active", lastAccess: iuDaysAgo(57, 15, 2), access: [...sf(["nwt", "cin", "iro", "jun", "kes", "mer"], "acctadmin"), ...sf(["arc", "bel", "dra", "eas", "fai"], "acctviewer")] },
    { id: "iu-aiko", name: "Aiko Yamada", email: "ayamada@sans.example", job: "Sales Support", status: "active", lastAccess: iuDaysAgo(266, 11, 20), access: [...sf(acctAdmin, "acctadmin"), hand("globex", "acctadmin", "Søren Vik", 89, "Covering an absent admin until the account team is assigned.")] },
    { id: "iu-priyanka", name: "Priyanka Rao", email: "prao@sans.example", job: "Sales", status: "active", lastAccess: iuDaysAgo(58, 9, 30), access: sf(["globex", "dra", "mer", "nor", "oak", "pin", "qua", "red", "lum", "har"], "acctviewer") },
    { id: "iu-noor", name: "Noor Balewa", email: "nbalewa@sans.example", job: "Customer Success Manager", status: "pending", invitedAt: iuDaysAgo(8), lastAccess: null, access: sf(["arc", "eas", "fai"], "acctadmin", 8) },
    { id: "iu-bram", name: "Bram Nielsen", email: "bnielsen@sans.example", job: "Platform Engineering", status: "active", lastAccess: iuDaysAgo(0, 7, 12), access: [hand(IU_TEST, "sysadmin", "Søren Vik", 307, "Platform engineering, sandbox only.")] },
    { id: "iu-elena", name: "Elena Fischer", email: "efischer@sans.example", job: "Content Operations", status: "active", lastAccess: iuDaysAgo(60, 10, 47), access: [hand(IU_ALL, "curation", "Søren Vik", 237, "Content operations, every organisation by function.")] },
  ];
}
var iuPeople = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(IU_KEY));
    if (Array.isArray(saved)) return saved;
  } catch (e) {}
  return iuSeed();
})();
function iuSave() {
  try {
    localStorage.setItem(IU_KEY, JSON.stringify(iuPeople));
  } catch (e) {
    toast("Changes could not be saved. Allow browser storage to keep them.");
  }
}
function iuPerson(id) {
  return iuPeople.find((p) => p.id === id);
}
function iuRole(id) {
  return IU_ROLES.find((r) => r.id === id) || { id, name: id, scope: "pick" };
}
function iuOrgName(id) {
  if (id === IU_ALL) return "All organisations";
  if (id === IU_TEST) return "SANS Test Account";
  return IU_ORGS.find((o) => o.id === id)?.name || id;
}
function iuCount(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
// One line per role: "SANS Account Admin" with "6 organisations", "All organisations" or "SANS Test Account".
function iuRoleLines(person) {
  const byRole = new Map();
  person.access.forEach((a) => byRole.set(a.role, [...(byRole.get(a.role) || []), a.orgId]));
  return [...byRole].map(([role, orgs]) => ({
    role: iuRole(role).name,
    reach: orgs.includes(IU_ALL) ? "All organisations" : orgs.includes(IU_TEST) ? "SANS Test Account only" : iuCount(orgs.length, "organisation"),
  }));
}
function iuOrgTotal(person) {
  return person.access.some((a) => a.orgId === IU_ALL) ? "All organisations" : iuCount(new Set(person.access.map((a) => a.orgId)).size, "organisation");
}
function iuDays(iso) {
  return iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null;
}
function iuDate(iso) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function iuWhen(iso) {
  if (!iso) return "Never signed in";
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? `Today at ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : iuDate(iso);
}
function iuPendingFor(person) {
  const days = iuDays(person.invitedAt);
  return days < 1 ? "Invited today" : `${iuCount(days, "day")} pending`;
}
function iuUnused(person) {
  return person.status === "active" && iuDays(person.lastAccess) >= IU_STALE_DAYS;
}
function iuStatusLabel(person) {
  return person.status === "pending" ? "Pending invite" : person.status === "deactivated" ? "Deactivated" : "Active";
}
function iuStatusBadge(person) {
  const s = iuStatusLabel(person);
  return `<span class="badge ${s === "Pending invite" ? "pending" : s === "Deactivated" ? "suspended" : ""}">${s}</span>`;
}
// Who added this person: the oldest access entry.
function iuAddedBy(person) {
  const first = [...person.access].sort((a, b) => String(a.at).localeCompare(String(b.at)))[0];
  if (!first) return ["Not recorded", ""];
  return first.source === "salesforce" ? ["Salesforce account team", `Automated · ${iuDate(first.at)}`] : [first.by || "SANS", `Granted by hand · ${iuDate(first.at)}`];
}

// ---------- List ----------
state.iuSearch = "";
state.iuRole = "";
state.iuChip = "all";
state.iuId = null;
const IU_CHIPS = [
  ["all", "All", () => true],
  ["active", "Active", (p) => p.status === "active"],
  ["pending", "Pending invite", (p) => p.status === "pending"],
  ["unused", `Unused ${IU_STALE_DAYS}+ days`, iuUnused],
  ["deactivated", "Deactivated", (p) => p.status === "deactivated"],
];
function iuVisible() {
  const q = state.iuSearch.trim().toLowerCase();
  const chip = IU_CHIPS.find(([key]) => key === state.iuChip) || IU_CHIPS[0];
  return iuPeople.filter(
    (p) =>
      (!q || `${p.name} ${p.email} ${p.job}`.toLowerCase().includes(q)) &&
      (!state.iuRole || p.access.some((a) => iuRole(a.role).name === state.iuRole)) &&
      chip[2](p),
  );
}
function iuListView() {
  const rows = iuVisible();
  const roles = [...new Set(iuPeople.flatMap((p) => p.access.map((a) => iuRole(a.role).name)))];
  const toolbar = `<div class="toolbar fidelity-toolbar iu-toolbar" data-spec="internal-users.toolbar" data-spec-label="Filters and search"><span class="filter-label">Filter</span><select id="iu-role-filter" aria-label="Filter by role">${opts(roles, state.iuRole, "Role")}</select><div class="search">${icon("search")}<input id="iu-search" placeholder="Search name, email or job function" aria-label="Search name, email or job function" value="${esc(state.iuSearch)}"></div><span class="iu-count">${rows.length} of ${iuPeople.length}</span></div>`;
  const chips = `<div class="chip-bar" role="group" aria-label="Quick filters" data-spec="internal-users.chips" data-spec-label="Quick filter chips">${IU_CHIPS.map(
    ([key, text, test]) => `<button type="button" class="filter-chip${key === state.iuChip ? " active" : ""}" data-action="iu-chip" data-chip="${key}" aria-pressed="${key === state.iuChip}">${esc(text)}<span class="chip-count">${iuPeople.filter(test).length}</span></button>`,
  ).join("")}</div>`;
  const body = rows.length
    ? rows
        .map((p) => {
          const [by, byMeta] = iuAddedBy(p);
          const pending = p.status === "pending" ? iuPendingFor(p) : iuWhen(p.lastAccess);
          return `<tr tabindex="0" class="clickable-row" data-iu-row="${esc(p.id)}" title="Open profile"><td><div class="person-name">${esc(p.name)}</div><div class="secondary">${esc(p.job)}</div></td><td class="iu-roles">${iuRoleLines(p)
            .map((r) => `<div class="iu-role-line"><span>${esc(r.role)}</span><span class="secondary">${esc(r.reach)}</span></div>`)
            .join("")}</td><td class="modifier"><span>${esc(by)}</span><span class="secondary">${esc(byMeta)}</span></td><td class="status-cell">${iuStatusBadge(p)}<span class="secondary">${esc(pending)}</span>${iuUnused(p) ? `<span class="iu-flag">${icon("schedule")}Unused ${IU_STALE_DAYS}+ days</span>` : ""}</td></tr>`;
        })
        .join("")
    : `<tr><td colspan="4"><div class="empty">${icon("search")}<h2>No SANS staff found</h2><p>Try another name or clear your filters.</p>${btn("Clear filters", "iu-clear")}</div></td></tr>`;
  return `${heading("Internal Users", `${iuCount(iuPeople.filter((p) => p.status !== "deactivated").length, "SANS employee")} can access this portal on behalf of customers.`, btn(icon("plus") + "Add SANS employee", "iu-add", "primary", 'data-spec="internal-users.add-button" data-spec-label="Add SANS employee button"'))}<section class="card people-card iu-card" aria-label="Internal users list" data-spec="internal-users.table" data-spec-label="Internal users table">${toolbar}${chips}<div class="table-wrap"><table class="people-table iu-table"><colgroup><col style="width:30%"><col style="width:28%"><col style="width:24%"><col style="width:18%"></colgroup><thead><tr><th>Name</th><th>Role</th><th>Added by</th><th>Status / Last access</th></tr></thead><tbody>${body}</tbody></table></div></section>`;
}

// ---------- Profile ----------
function iuProfileView() {
  const p = iuPerson(state.iuId);
  const back = `<button class="back" data-action="iu-back">${icon("back")}Back to Internal users</button>`;
  if (!p) return `${back}${heading("Person not found", "This record may have been removed.")}`;
  const [by, byMeta] = iuAddedBy(p);
  const actions =
    p.status === "deactivated"
      ? btn(icon("refresh") + "Reactivate", "iu-reactivate", "", 'data-spec="internal-users.reactivate" data-spec-label="Reactivate button"')
      : btn(icon("trash") + "Deactivate…", "iu-deactivate", "danger", 'data-spec="internal-users.deactivate" data-spec-label="Deactivate button"');
  const pending =
    p.status === "pending"
      ? `<section class="card iu-notice" aria-label="Invitation">${icon("schedule")}<div><h2>Invitation pending · ${iuPendingFor(p).replace(" pending", "")}</h2><p>The access below is what ${esc(p.name.split(" ")[0])} will hold. Until they accept, they cannot reach any organisation.</p></div>${btn(icon("mail") + "Resend invitation", "iu-resend")}</section>`
      : p.status === "deactivated"
        ? `<section class="card iu-notice iu-notice-off" aria-label="Deactivated">${icon("info")}<div><h2>Deactivated</h2><p>${esc(p.name)} cannot sign in. The record is kept so past activity still names them.</p></div></section>`
        : "";
  const rows = [...p.access].sort((a, b) => iuOrgName(a.orgId).localeCompare(iuOrgName(b.orgId)));
  const orgCell = (a) =>
    a.orgId === IU_ALL || a.orgId === IU_TEST
      ? `<span class="person-name">${esc(iuOrgName(a.orgId))}</span>`
      : `<button type="button" class="iu-org-link" data-action="iu-open-org" data-org="${esc(a.orgId)}">${esc(iuOrgName(a.orgId))}</button>`;
  const source = (a) =>
    a.source === "salesforce"
      ? `<span>Salesforce account team</span><span class="secondary">Automated · ${iuDate(a.at)}</span>`
      : `<span>${esc(a.by || "SANS")}</span><span class="secondary">Granted by hand · ${iuDate(a.at)}</span>${a.note ? `<span class="secondary iu-note">${esc(a.note)}</span>` : ""}`;
  const editable = p.status !== "deactivated";
  const accessCard = `<section class="card iu-access-card" aria-labelledby="iu-access-title" data-spec="internal-users.org-access" data-spec-label="Organisation access"><div class="profile-card-head"><div class="iu-head-title"><h2 id="iu-access-title">Organisation access</h2><span class="iu-count">${esc(iuOrgTotal(p))}</span></div>${editable ? btn(icon("plus") + "Add to organisation", "iu-grant", "", 'data-spec="internal-users.add-to-org" data-spec-label="Add to organisation button"') : ""}</div><div class="table-wrap"><table class="people-table iu-access-table"><colgroup>${editable ? '<col style="width:36%"><col style="width:24%"><col style="width:34%"><col style="width:6%">' : '<col style="width:38%"><col style="width:24%"><col style="width:38%">'}</colgroup><thead><tr><th>Organisation</th><th>Role</th><th>Added by</th>${editable ? '<th><span class="sr-only">Actions</span></th>' : ""}</tr></thead><tbody>${rows
    .map((a) => `<tr><td>${orgCell(a)}</td><td>${esc(iuRole(a.role).name)}</td><td class="modifier">${source(a)}</td>${editable ? `<td class="menu-cell iu-menu-cell">${iuAccessMenu(p, a)}</td>` : ""}</tr>`)
    .join("")}</tbody></table></div></section>`;
  return `${back}
  <section class="profile-summary" aria-labelledby="iu-name">
    <div class="profile-identity"><span class="profile-avatar">${esc(initial(p.name))}</span><div><h1 id="iu-name" tabindex="-1">${esc(p.name)}</h1><p>${esc(p.job)}</p><a href="mailto:${esc(p.email)}">${esc(p.email)}</a></div></div>
    <div class="profile-summary-side"><div class="profile-role-list" aria-label="Status">${iuStatusBadge(p)}${iuUnused(p) ? `<span class="iu-flag">${icon("schedule")}Unused ${IU_STALE_DAYS}+ days</span>` : ""}</div>${actions}</div>
  </section>
  ${pending}
  <section class="card profile-access-card iu-details-card" aria-labelledby="iu-details-title">${profileSectionHead("Details", "", "iu-details-title")}${profileDetailRows([
    ["Email", p.email],
    ["Job function", p.job],
    ["Last access", p.status === "pending" ? "Not signed in yet" : iuWhen(p.lastAccess)],
    ["Added by", `${by} · ${byMeta}`],
  ])}</section>
  ${accessCard}`;
}

// Row menu on the profile's Organisation access table: Edit access or Remove access for one organisation.
function iuAccessMenu(person, a) {
  const i = person.access.indexOf(a);
  const key = `iu-access-${i}`;
  const open = state.rowMenu === key;
  const org = iuOrgName(a.orgId);
  return `<div class="menu-anchor row-menu-anchor" data-spec="internal-users.access-menu" data-spec-label="Organisation access row menu"><button type="button" class="icon-btn kebab" data-action="iu-access-menu" data-index="${i}" aria-label="Actions for ${esc(org)}" aria-haspopup="menu" aria-expanded="${open}">${menuIcon()}</button>${
    open ? `<div class="dropdown-menu row-dropdown" role="menu">${btn("Edit access", "iu-row-edit", "", `role="menuitem" data-index="${i}"`)}${btn("Remove access…", "iu-row-remove", "danger", `role="menuitem" data-index="${i}"`)}</div>` : ""
  }</div>`;
}

const iuBaseContent = content;
content = function () {
  if (state.view === "internal-users") return state.iuId ? iuProfileView() : iuListView();
  return iuBaseContent();
};
function iuOpen(id) {
  state.iuId = id;
  render();
  window.scrollTo(0, 0);
  $("#iu-name")?.focus({ preventScroll: true });
}
function iuLeave() {
  const from = state.iuId;
  state.iuId = null;
  render();
  document.querySelector(`[data-iu-row="${from}"]`)?.focus({ preventScroll: true });
}

// ---------- Organisation picker (shared by Add and Edit access) ----------
// `form` holds: role, orgs (picked ids), q (search) and, for Edit, the existing rows.
function iuScopeHtml(form, taken = []) {
  const role = iuRole(form.role);
  if (role.scope === "all")
    return `<div class="iu-scope-note">${icon("info")}<span>${esc(role.name)}s reach every organisation, so there is nothing to choose. Only give this role to people who run the portal.</span></div>`;
  if (role.scope === "test") return `<div class="iu-scope-note">${icon("info")}<span>System Admins work in the SANS Test Account only. They never see customer data.</span></div>`;
  const q = (form.q || "").trim().toLowerCase();
  const choices = IU_ORGS.filter((o) => !taken.includes(o.id));
  const shown = choices.filter((o) => !q || o.name.toLowerCase().includes(q));
  const picked = form.orgs.filter((id) => choices.some((o) => o.id === id));
  return `<div class="iu-picked" aria-live="polite">${picked.length ? picked.map((id) => `<span class="iu-pill">${esc(iuOrgName(id))}<button type="button" class="icon-btn" data-action="iu-unpick" data-org="${esc(id)}" aria-label="Remove ${esc(iuOrgName(id))}">${icon("close")}</button></span>`).join("") : '<span class="hint">No organisations selected</span>'}</div><div class="search scope-search">${icon("search")}<input id="iu-org-search" placeholder="Search organisations" aria-label="Search organisations" value="${esc(form.q || "")}" autocomplete="off"></div><div class="scope-options checks iu-org-list" role="group" aria-label="Organisations">${
    shown.length
      ? shown.map((o) => `<label class="check scope-choice"><input type="checkbox" name="iu-org" value="${esc(o.id)}" ${form.orgs.includes(o.id) ? "checked" : ""}><span>${esc(o.name)}</span>${o.id === "sans" ? "<small>Default</small>" : ""}</label>`).join("")
      : `<p class="hint">No organisations match “${esc(form.q)}”.</p>`
  }</div><p class="hint">${iuCount(picked.length, "organisation")} selected. Pick as many as this person covers. Each one is invited once.</p>`;
}
function iuRolePicker(name, value, roles) {
  return `<div class="role-picker iu-role-picker">${roles
    .map((r) => `<label class="role-option"><input type="radio" name="${name}" value="${r.id}" ${value === r.id ? "checked" : ""}><strong>${esc(r.name)}</strong><small>${esc(r.blurb)}</small></label>`)
    .join("")}</div>`;
}
// Role changes swap the organisation area for a note (or back), so ease the height
// change and fade the new content in rather than letting the dialog jump.
function iuAnimateSwap(box, paint) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !box.animate) return paint();
  box.getAnimations().forEach((anim) => anim.cancel());
  const from = box.offsetHeight;
  paint();
  const to = box.offsetHeight;
  const ease = "cubic-bezier(0.22, 1, 0.36, 1)";
  if (from !== to) {
    box.style.overflow = "hidden";
    box.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 260, easing: ease }).finished.then(
      () => (box.style.overflow = ""),
      () => {},
    );
  }
  box.animate([{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], { duration: 220, delay: 60, easing: ease, fill: "backwards" });
}
function iuPaintScope(animate = false) {
  const form = state.iuForm;
  const box = $("#iu-scope");
  if (!form || !box) return;
  const error = $("#iu-form-error");
  if (error) error.textContent = "";
  const search = document.activeElement?.id === "iu-org-search" ? document.activeElement.selectionStart : null;
  const html = iuScopeHtml(form, form.mode === "edit" || form.mode === "grant" ? iuPerson(form.id).access.filter((a) => !form.removed.includes(a)).map((a) => a.orgId) : []);
  if (animate) iuAnimateSwap(box, () => (box.innerHTML = html));
  else box.innerHTML = html;
  if (search !== null) {
    const input = $("#iu-org-search");
    input?.focus();
    input?.setSelectionRange(search, search);
  }
}

// ---------- Add SANS employee ----------
function iuAddForm() {
  state.iuForm = { mode: "add", name: "", email: "", job: "", role: "acctadmin", orgs: ["sans"], q: "", reason: "" };
  state.modal = "iu-add";
  openModal(
    "Add SANS employee",
    "Give a SANS employee access to the portal. They get an email invitation and show as Pending invite until they accept.",
    `<form id="iu-add-form" class="iu-form" novalidate><section class="field-section"><h3 class="iu-section-title">Person</h3><div class="form-grid iu-person-grid"><div class="field"><label for="iu-name-input">Full name <span class="required">*</span></label><input id="iu-name-input" name="name" required autocomplete="off"></div><div class="field"><label for="iu-email-input">SANS email <span class="required">*</span></label><input id="iu-email-input" name="email" type="email" required placeholder="name@sans.example" autocomplete="off"></div><div class="field"><label for="iu-job-input">Job function</label><input id="iu-job-input" name="job" placeholder="Customer Success Manager" autocomplete="off"></div></div></section><section class="field-section"><label>Role <span class="required">*</span></label>${iuRolePicker("iu-role", "acctadmin", IU_ROLES.filter((r) => r.offered))}</section><section class="field-section"><label>Organisations <span class="required">*</span> ${helpMark("Choose every organisation this person works on. SANS is selected by default.")}</label><div id="iu-scope">${iuScopeHtml(state.iuForm)}</div></section><section class="field-section"><div class="field"><label for="iu-reason-input">Reason for access <span class="required">*</span></label><input id="iu-reason-input" name="reason" required placeholder="For example, new CSM for this book of business" autocomplete="off"></div></section><p class="inline-error" id="iu-form-error" role="alert"></p></form>`,
    `<span class="secondary">Demo invitation · no email will be sent</span><div class="actions">${btn("Cancel", "close-modal", "text")}<button class="button primary" type="submit" form="iu-add-form">Add and send invitation</button></div>`,
  );
  $("#modal").classList.add("fidelity-modal", "iu-modal");
}
function iuSubmitAdd(formEl) {
  const f = state.iuForm;
  const fd = new FormData(formEl);
  const name = String(fd.get("name") || "").trim();
  const email = String(fd.get("email") || "").trim().toLowerCase();
  const job = String(fd.get("job") || "").trim();
  const reason = String(fd.get("reason") || "").trim();
  const role = iuRole(f.role);
  const error = !name
    ? ["Enter their full name.", "#iu-name-input"]
    : !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
      ? ["Enter a valid SANS email address.", "#iu-email-input"]
      : iuPeople.some((p) => p.email === email)
        ? [`${email} is already an internal user.`, "#iu-email-input"]
        : role.scope === "pick" && !f.orgs.length
          ? ["Choose at least one organisation.", "#iu-org-search"]
          : !reason
            ? ["Give a reason for this access. It is kept with the record.", "#iu-reason-input"]
            : null;
  if (error) {
    $("#iu-form-error").textContent = error[0];
    $(error[1])?.focus();
    return;
  }
  const at = new Date().toISOString();
  const orgIds = role.scope === "all" ? [IU_ALL] : role.scope === "test" ? [IU_TEST] : f.orgs;
  const person = {
    id: "iu-" + Date.now().toString(36),
    name,
    email,
    job: job || "Not set",
    status: "pending",
    invitedAt: at,
    lastAccess: null,
    access: orgIds.map((orgId) => ({ orgId, role: role.id, source: "hand", by: "Ada Whitfield", at, note: reason })),
  };
  iuPeople.push(person);
  iuSave();
  $("#modal").close();
  state.modal = null;
  state.iuForm = null;
  toast(`Invitation sent to ${email}. They show as Pending invite until they accept.`);
  iuOpen(person.id);
}

// ---------- Edit access ----------
function iuEditForm() {
  const p = iuPerson(state.iuId);
  if (!p) return;
  state.iuForm = { mode: "edit", id: p.id, role: "acctadmin", orgs: [], q: "", removed: [], roles: new Map() };
  state.modal = "iu-edit";
  iuPaintEdit();
}
function iuPaintEdit() {
  const f = state.iuForm;
  const p = iuPerson(f.id);
  const kept = p.access.filter((a) => !f.removed.includes(a)).sort((a, b) => iuOrgName(a.orgId).localeCompare(iuOrgName(b.orgId)));
  const autoRemoved = f.removed.some((a) => a.source === "salesforce");
  const pickRoles = IU_ROLES.filter((r) => r.scope === "pick");
  const row = (a) => {
    const i = p.access.indexOf(a);
    const role = iuRole(a.role);
    const select =
      role.scope === "pick"
        ? `<select data-iu-access-role="${i}" aria-label="Role for ${esc(iuOrgName(a.orgId))}">${pickRoles.map((r) => `<option value="${r.id}" ${(f.roles.get(a) || a.role) === r.id ? "selected" : ""}>${esc(r.name)}</option>`).join("")}</select>`
        : `<span>${esc(role.name)}</span>`;
    return `<tr><td>${esc(iuOrgName(a.orgId))}${a.source === "salesforce" ? '<span class="secondary">Automated</span>' : ""}</td><td>${select}</td><td class="iu-remove-cell"><button type="button" class="button text small" data-action="iu-remove-access" data-index="${i}">Remove</button></td></tr>`;
  };
  openModal(
    "Edit access",
    `${esc(p.name)} · ${esc(p.job)}`,
    `<form id="iu-edit-form" class="iu-form" novalidate><section class="field-section"><h3 class="iu-section-title">Current access</h3>${
      kept.length
        ? `<table class="people-table iu-edit-table"><thead><tr><th>Organisation</th><th>Role</th><th><span class="sr-only">Remove</span></th></tr></thead><tbody>${kept.map(row).join("")}</tbody></table>`
        : '<p class="hint">No access left. Add an organisation below, or deactivate this person instead.</p>'
    }${autoRemoved ? `<div class="iu-scope-note iu-warn">${icon("error")}<span>Some removed access comes from the Salesforce account team. It returns at the next sync unless the account team changes too.</span></div>` : ""}${f.removed.length ? `<p class="hint">${iuCount(f.removed.length, "organisation")} will be removed when you save. ${btn("Undo", "iu-undo-remove", "text small")}</p>` : ""}</section><section class="field-section"><h3 class="iu-section-title">Give access to more organisations</h3><label>Role</label>${iuRolePicker("iu-edit-role", f.role, pickRoles)}<div id="iu-scope">${iuScopeHtml(f, kept.map((a) => a.orgId))}</div></section><p class="inline-error" id="iu-form-error" role="alert"></p></form>`,
    `<div class="actions">${btn("Cancel", "close-modal", "text")}<button class="button primary" type="submit" form="iu-edit-form">Save access</button></div>`,
  );
  $("#modal").classList.add("fidelity-modal", "iu-modal");
}
function iuSubmitEdit() {
  const f = state.iuForm;
  const p = iuPerson(f.id);
  const at = new Date().toISOString();
  const kept = p.access
    .filter((a) => !f.removed.includes(a))
    .map((a) => {
      const role = f.roles.get(a);
      return role && role !== a.role ? { ...a, role, source: "hand", by: "Ada Whitfield", at, note: "" } : a;
    });
  const taken = kept.map((a) => a.orgId);
  const added = f.orgs.filter((id) => !taken.includes(id)).map((orgId) => ({ orgId, role: f.role, source: "hand", by: "Ada Whitfield", at, note: "" }));
  const next = [...kept, ...added];
  if (!next.length) {
    $("#iu-form-error").textContent = "Someone with no organisation access cannot use the portal. Deactivate them instead.";
    return;
  }
  const changed = f.removed.length || added.length || [...f.roles].some(([a, role]) => role !== a.role && !f.removed.includes(a));
  p.access = next;
  iuSave();
  $("#modal").close();
  state.modal = null;
  state.iuForm = null;
  toast(changed ? `${p.name}’s access updated` : "No changes to save");
  render();
}

// ---------- Edit or remove one organisation (from the access table row menu) ----------
function iuRowAccess(index) {
  const p = iuPerson(state.iuId);
  return p ? [p, p.access[Number(index)]] : [];
}
function iuRowEditForm(index) {
  const [p, a] = iuRowAccess(index);
  if (!a) return;
  // Role-wide access (every organisation, or the test account) is changed in the full Edit access dialog.
  if (iuRole(a.role).scope !== "pick") return iuEditForm();
  state.iuForm = { mode: "row", id: p.id, index: Number(index), role: a.role };
  state.modal = "iu-row-edit";
  const org = iuOrgName(a.orgId);
  openModal(
    `Edit access to ${esc(org)}`,
    `${esc(p.name)} · ${esc(p.job)}`,
    `<form id="iu-row-edit-form" class="iu-form" novalidate><section class="field-section"><label>Role for ${esc(org)}</label>${iuRolePicker("iu-row-role", a.role, IU_ROLES.filter((r) => r.scope === "pick"))}${
      a.source === "salesforce"
        ? `<div class="iu-scope-note iu-warn">${icon("error")}<span>This access comes from the Salesforce account team. A change here is kept as a manual grant and overrides the sync for ${esc(org)}.</span></div>`
        : ""
    }</section><section class="field-section"><div class="field"><label for="iu-row-reason">Reason for change</label><input id="iu-row-reason" name="reason" placeholder="For example, now leads this account" autocomplete="off"></div></section><p class="inline-error" id="iu-form-error" role="alert"></p></form>`,
    `<div class="actions">${btn("Cancel", "close-modal", "text")}<button class="button primary" type="submit" form="iu-row-edit-form">Save access</button></div>`,
  );
  $("#modal").classList.add("fidelity-modal", "iu-modal");
}
function iuSubmitRowEdit(formEl) {
  const f = state.iuForm;
  const p = iuPerson(f.id);
  const a = p.access[f.index];
  const role = new FormData(formEl).get("iu-row-role") || a.role;
  const note = String(new FormData(formEl).get("reason") || "").trim();
  iuCloseModal();
  if (role === a.role) return toast("No changes to save");
  p.access[f.index] = { ...a, role, source: "hand", by: "Ada Whitfield", at: new Date().toISOString(), note };
  iuSave();
  toast(`${p.name} is now ${iuRole(role).name} for ${iuOrgName(a.orgId)}`);
  render();
}
function iuRowRemoveForm(index) {
  const [p, a] = iuRowAccess(index);
  if (!a) return;
  state.iuForm = { mode: "row-remove", id: p.id, index: Number(index) };
  state.modal = "iu-row-remove";
  const org = iuOrgName(a.orgId);
  const last = p.access.length === 1;
  const first = esc(p.name.split(" ")[0]);
  const body = last
    ? `<p>${esc(org)} is ${first}’s only organisation. Someone with no organisation access cannot use the portal, so deactivate them instead.</p>`
    : `<p>${esc(p.name)} loses ${esc(iuRole(a.role).name)} access to ${esc(org)} straight away. Their access to other organisations is not affected.</p>${
        a.source === "salesforce"
          ? `<div class="iu-scope-note iu-warn">${icon("error")}<span>This access comes from the Salesforce account team. It returns at the next sync unless the account team changes too.</span></div>`
          : ""
      }`;
  openModal(
    `Remove access to ${esc(org)}?`,
    "",
    `<form id="iu-row-remove-form" novalidate>${body}</form>`,
    `<div class="actions">${btn("Cancel", "close-modal", "text")}${
      last ? btn("Deactivate instead…", "iu-deactivate", "danger") : `<button class="button danger" type="submit" form="iu-row-remove-form">Remove access</button>`
    }</div>`,
    "",
    true,
  );
  $("#modal").classList.add("fidelity-modal", "iu-modal", "iu-confirm-modal");
}
// "Add to organisation" above the access table: one role, any organisations this person does not have yet.
function iuGrantForm() {
  const p = iuPerson(state.iuId);
  if (!p) return;
  if (p.access.some((a) => a.orgId === IU_ALL)) {
    toast(`${p.name} already reaches every organisation through their role`);
    return;
  }
  state.iuForm = { mode: "grant", id: p.id, role: "acctadmin", orgs: [], q: "", removed: [] };
  state.modal = "iu-grant";
  openModal(
    "Add to organisation",
    `${esc(p.name)} · ${esc(p.job)}`,
    `<form id="iu-grant-form" class="iu-form" novalidate><section class="field-section"><label>Role <span class="required">*</span></label>${iuRolePicker("iu-edit-role", "acctadmin", IU_ROLES.filter((r) => r.scope === "pick"))}</section><section class="field-section"><label>Organisations <span class="required">*</span></label><div id="iu-scope">${iuScopeHtml(state.iuForm, iuGrantTaken(p))}</div></section><section class="field-section"><div class="field"><label for="iu-grant-reason">Reason for access <span class="required">*</span></label><input id="iu-grant-reason" name="reason" required placeholder="For example, covering this account while its CSM is away" autocomplete="off"></div></section><p class="inline-error" id="iu-form-error" role="alert"></p></form>`,
    `<div class="actions">${btn("Cancel", "close-modal", "text")}<button class="button primary" type="submit" form="iu-grant-form">Add access</button></div>`,
  );
  $("#modal").classList.add("fidelity-modal", "iu-modal");
}
function iuGrantTaken(p) {
  return p.access.map((a) => a.orgId);
}
function iuSubmitGrant(formEl) {
  const f = state.iuForm;
  const p = iuPerson(f.id);
  const taken = iuGrantTaken(p);
  const orgs = f.orgs.filter((id) => !taken.includes(id));
  const note = String(new FormData(formEl).get("reason") || "").trim();
  const error = !orgs.length ? ["Choose at least one organisation.", "#iu-org-search"] : !note ? ["Give a reason for this access. It is kept with the record.", "#iu-grant-reason"] : null;
  if (error) {
    $("#iu-form-error").textContent = error[0];
    $(error[1])?.focus();
    return;
  }
  const at = new Date().toISOString();
  p.access.push(...orgs.map((orgId) => ({ orgId, role: f.role, source: "hand", by: "Ada Whitfield", at, note })));
  iuSave();
  iuCloseModal();
  toast(orgs.length === 1 ? `${p.name} added to ${iuOrgName(orgs[0])} as ${iuRole(f.role).name}` : `${p.name} added to ${iuCount(orgs.length, "organisation")} as ${iuRole(f.role).name}`);
  render();
}
function iuSubmitRowRemove() {
  const f = state.iuForm;
  const p = iuPerson(f.id);
  const [a] = p.access.splice(f.index, 1);
  iuSave();
  iuCloseModal();
  toast(`${p.name} no longer has access to ${iuOrgName(a.orgId)}`);
  render();
}
function iuCloseModal() {
  $("#modal").close();
  state.modal = null;
  state.iuForm = null;
}

// ---------- Deactivate ----------
var IU_CONFIRM_WORD = "deactivate";
function iuDeactivateForm() {
  const p = iuPerson(state.iuId);
  if (!p) return;
  state.modal = "iu-deactivate";
  openModal(
    `Deactivate ${esc(p.name)}?`,
    "",
    `<form id="iu-deactivate-form" novalidate><p>Access stops straight away across ${esc(iuOrgTotal(p).toLowerCase())}. The record stays, so everything ${esc(p.name.split(" ")[0])} has done keeps their name. You can reactivate them later.</p><div class="field"><label for="iu-confirm-input">Type <strong>${IU_CONFIRM_WORD}</strong> to confirm</label><input id="iu-confirm-input" autocomplete="off" spellcheck="false" aria-describedby="iu-confirm-hint"><p class="hint" id="iu-confirm-hint">This stops ${esc(p.name)} signing in to the portal.</p></div></form>`,
    `<div class="actions">${btn("Cancel", "close-modal", "text")}<button class="button danger" type="submit" form="iu-deactivate-form" id="iu-confirm-button" disabled>Deactivate</button></div>`,
    "",
    true,
  );
  $("#modal").classList.add("fidelity-modal", "iu-modal", "iu-confirm-modal");
}
function iuConfirmMatches() {
  return ($("#iu-confirm-input")?.value || "").trim().toLowerCase() === IU_CONFIRM_WORD;
}

// ---------- Events ----------
document.addEventListener(
  "click",
  (event) => {
    const target = event.target.closest("[data-action]");
    if (target?.dataset.action === "navigate") {
      // The sidebar link always lands on the list; a full demo reset is handled below.
      if (target.dataset.view === "internal-users") state.iuId = null;
      return;
    }
    if (!target) {
      const tr = event.target.closest("#main .iu-table tr[data-iu-row]");
      if (tr) iuOpen(tr.dataset.iuRow);
      return;
    }
    const a = target.dataset.action;
    if (!a.startsWith("iu-")) {
      if (a === "confirm-reset") {
        iuPeople = iuSeed();
        try {
          localStorage.removeItem(IU_KEY);
        } catch (e) {}
        state.iuId = null;
      }
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const f = state.iuForm;
    switch (a) {
      case "iu-add":
        return iuAddForm();
      case "iu-back":
        return iuLeave();
      case "iu-chip":
        state.iuChip = target.dataset.chip;
        render();
        document.querySelector(`[data-chip="${state.iuChip}"]`)?.focus();
        return;
      case "iu-clear":
        state.iuSearch = "";
        state.iuRole = "";
        state.iuChip = "all";
        render();
        return;
      case "iu-edit":
        return iuEditForm();
      case "iu-grant":
        return iuGrantForm();
      case "iu-access-menu": {
        const key = `iu-access-${target.dataset.index}`;
        state.rowMenu = state.rowMenu === key ? null : key;
        render();
        document.querySelector(`[data-action="iu-access-menu"][data-index="${target.dataset.index}"]`)?.focus();
        if (state.rowMenu) document.querySelector(".iu-menu-cell .row-dropdown button")?.focus();
        return;
      }
      case "iu-row-edit":
        state.rowMenu = null;
        render();
        return iuRowEditForm(target.dataset.index);
      case "iu-row-remove":
        state.rowMenu = null;
        render();
        return iuRowRemoveForm(target.dataset.index);
      case "iu-deactivate":
        if ($("#modal").open) $("#modal").close();
        return iuDeactivateForm();
      case "iu-reactivate": {
        const p = iuPerson(state.iuId);
        p.status = "active";
        iuSave();
        toast(`${p.name} reactivated. Their access is restored.`);
        render();
        return;
      }
      case "iu-resend":
        toast(`Invitation resent to ${iuPerson(state.iuId).email}. The first link still works.`);
        return;
      case "iu-open-org":
        state.iuId = null;
        navigate("customer-organizations");
        toast(`Customer Organizations will open ${iuOrgName(target.dataset.org)} once that page is designed`);
        return;
      case "iu-unpick":
        f.orgs = f.orgs.filter((id) => id !== target.dataset.org);
        iuPaintScope();
        $("#iu-org-search")?.focus();
        return;
      case "iu-remove-access": {
        const p = iuPerson(f.id);
        f.removed.push(p.access[Number(target.dataset.index)]);
        iuPaintEdit();
        $("#modal .iu-edit-table button, #iu-org-search")?.focus();
        return;
      }
      case "iu-undo-remove":
        f.removed = [];
        iuPaintEdit();
        return;
    }
  },
  true,
);
document.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Enter" && event.target.matches?.("#main .iu-table tr[data-iu-row]")) iuOpen(event.target.dataset.iuRow);
  },
  true,
);
document.addEventListener("input", (event) => {
  const el = event.target;
  if (el.id === "iu-search") {
    state.iuSearch = el.value;
    render();
  } else if (el.id === "iu-org-search" && state.iuForm) {
    state.iuForm.q = el.value;
    iuPaintScope();
  } else if (el.id === "iu-confirm-input") {
    $("#iu-confirm-button").disabled = !iuConfirmMatches();
  }
});
document.addEventListener(
  "change",
  (event) => {
    const el = event.target;
    const f = state.iuForm;
    if (el.id === "iu-role-filter") {
      event.stopImmediatePropagation();
      state.iuRole = el.value;
      render();
      $("#iu-role-filter")?.focus();
    } else if (f && (el.name === "iu-role" || el.name === "iu-edit-role")) {
      event.stopImmediatePropagation();
      const before = iuRole(f.role).scope;
      f.role = el.value;
      // Only animate when the area actually changes shape (picker vs note).
      iuPaintScope(iuRole(f.role).scope !== before || iuRole(f.role).scope !== "pick");
    } else if (f && el.name === "iu-org") {
      event.stopImmediatePropagation();
      f.orgs = el.checked ? [...new Set([...f.orgs, el.value])] : f.orgs.filter((id) => id !== el.value);
      iuPaintScope();
      document.querySelector(`#iu-scope input[value="${el.value}"]`)?.focus();
    } else if (f && el.dataset?.iuAccessRole !== undefined) {
      event.stopImmediatePropagation();
      f.roles.set(iuPerson(f.id).access[Number(el.dataset.iuAccessRole)], el.value);
    }
  },
  true,
);
document.addEventListener(
  "submit",
  (event) => {
    const id = event.target.id;
    if (!["iu-add-form", "iu-edit-form", "iu-deactivate-form", "iu-row-edit-form", "iu-row-remove-form", "iu-grant-form"].includes(id)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (id === "iu-add-form") return iuSubmitAdd(event.target);
    if (id === "iu-edit-form") return iuSubmitEdit();
    if (id === "iu-row-edit-form") return iuSubmitRowEdit(event.target);
    if (id === "iu-row-remove-form") return iuSubmitRowRemove();
    if (id === "iu-grant-form") return iuSubmitGrant(event.target);
    if (!iuConfirmMatches()) return;
    const p = iuPerson(state.iuId);
    p.status = "deactivated";
    iuSave();
    $("#modal").close();
    state.modal = null;
    toast(`${p.name} deactivated. Their record is kept.`);
    render();
  },
  true,
);
// Enter in the organisation search would submit the form; keep it in the list instead.
document.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Enter" && event.target.id === "iu-org-search") event.preventDefault();
  },
  true,
);
$("#modal").addEventListener("close", () => {
  if (String(state.modal || "").startsWith("iu-") && !$("#modal").open) state.iuForm = null;
});
if (state.view === "internal-users") render();
