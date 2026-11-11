// Teams: a card or row list with health checks, a page per team with tabs
// (Members, Portal users with access, History), and one side panel for adding
// students. Moves and removals go through store.bulk(), so they share the
// permission checks, activity events and Undo used on Students.
// Loads after import-review.js and before motion.js.

var TEAMS_LAYOUT_KEY = "sans-teams-layout";

// ---------- Data helpers ----------
function teamRecords() {
  return store.snapshot().teams;
}
function teamById(id) {
  return teamRecords().find((team) => team.id === id);
}
function currentTeam() {
  return state.teamId ? teamById(state.teamId) : null;
}
function teamMembers(team) {
  return db.users.filter((u) => u.type === "student" && u.teams.includes(team.name));
}
function teamAccess(team) {
  return db.users.filter((u) => u.type === "portal" && u.teams.includes(team.name));
}
function teamEvents(team) {
  return store
    .snapshot()
    .events.filter(
      (event) =>
        (event.target?.type === "team" && event.target.id === team.id) ||
        event.changes?.some((change) => change.field === "team" && (change.from === team.name || change.to === team.name)),
    );
}
function teamSummary(team) {
  const members = teamMembers(team);
  const access = teamAccess(team);
  const groups = [...new Set(members.flatMap((u) => u.groups))];
  const last = teamEvents(team)[0]?.at || team.updatedAt || team.createdAt;
  return {
    ...team,
    members,
    access,
    groups,
    pending: members.filter((u) => u.status === "Pending invite").length,
    needsVoucher: members.filter((u) => u.status === "Needs voucher").length,
    last,
  };
}
function personName(id) {
  if (!id || id === "system") return "SANS";
  return store.snapshot().people.find((p) => p.id === id)?.name || "Someone";
}
function shortName(name) {
  const parts = String(name || "").trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}` : parts[0] || "";
}
function teamDayLabel(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days < 1) return "Today";
  if (days < 2) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}
function readLayout() {
  try {
    return localStorage.getItem(TEAMS_LAYOUT_KEY) === "rows" ? "rows" : "cards";
  } catch {
    return "cards";
  }
}
function saveLayout(layout) {
  try {
    localStorage.setItem(TEAMS_LAYOUT_KEY, layout);
  } catch {}
}
function teamsState() {
  state.teamsQuery ??= "";
  state.teamsChip ??= "all";
  state.teamsSort ??= "name";
  state.teamsLayout ??= readLayout();
  state.teamSel ??= [];
  state.teamTab ??= "members";
  state.teamSearch ??= "";
  state.teamChip ??= "all";
  state.teamHistoryOpen ??= [];
  state.teamHistoryShown ??= 20;
  return state;
}

// ---------- Teams list ----------
var TEAMS_CHIPS = [
  ["all", "All", () => true],
  ["empty", "Empty", (t) => !t.members.length],
  ["hidden", "Not Visible to Anyone", (t) => !t.access.length],
];
var TEAMS_SORTS = [
  ["name", "Name A to Z", (a, b) => a.name.localeCompare(b.name)],
  ["members", "Most Members", (a, b) => b.members.length - a.members.length || a.name.localeCompare(b.name)],
  ["recent", "Recently Changed", (a, b) => Date.parse(b.last || 0) - Date.parse(a.last || 0)],
];

function healthTile(kind, tone, title, detail, go) {
  return `<button type="button" class="health-tile ${tone}" data-action="teams-health" data-go="${go}"><span class="health-dot" aria-hidden="true"></span><span class="health-text"><strong>${title}</strong><span>${detail}</span></span>${icon("arrow")}</button>`;
}
function teamsHealth(all) {
  const noTeam = db.users.filter((u) => u.type === "student" && !u.teams.length).length;
  const empty = all.filter((t) => !t.members.length).length;
  const hidden = all.filter((t) => !t.access.length).length;
  return `<div class="health-strip" role="group" aria-label="Team Health" data-spec="teams.health" data-spec-label="Team health strip">${
    noTeam
      ? healthTile("noTeam", "warn", `${pluralize(noTeam, "student")} in no team`, "They don't appear in any team report. Assign them", "no-team")
      : healthTile("noTeam", "ok", "Every student is in a team", "Nothing to assign", "no-team")
  }${
    empty
      ? healthTile("empty", "neutral", `${pluralize(empty, "empty team")}`, "Add students, or delete teams you no longer need", "empty")
      : healthTile("empty", "ok", "No Empty Teams", "Every team has members", "empty")
  }${
    hidden
      ? healthTile("hidden", "neutral", `${pluralize(hidden, "team")} not visible to anyone`, "No portal user can see their reports", "hidden")
      : healthTile("hidden", "ok", "Every team is visible", "Each one has at least one portal user with access", "hidden")
  }</div>`;
}
function teamsToolbar(all) {
  const counts = Object.fromEntries(TEAMS_CHIPS.map(([key, , test]) => [key, all.filter(test).length]));
  return `<div class="teams-toolbar" data-spec="teams.toolbar" data-spec-label="Search, filters and sort"><div class="search">${icon("search")}<input id="teams-search" placeholder="Search teams" aria-label="Search teams" value="${esc(state.teamsQuery)}" autocomplete="off"></div><div class="chip-bar" role="group" aria-label="Quick filters">${TEAMS_CHIPS.map(
    ([key, label]) => `<button type="button" class="filter-chip${state.teamsChip === key ? " active" : ""}" data-action="teams-chip" data-chip="${key}" aria-pressed="${state.teamsChip === key}">${esc(label)}<span class="chip-count">${counts[key]}</span></button>`,
  ).join("")}</div><span class="teams-toolbar-spacer"></span><label class="teams-sort" for="teams-sort"><span>Sort</span><select id="teams-sort">${TEAMS_SORTS.map(([key, label]) => `<option value="${key}" ${state.teamsSort === key ? "selected" : ""}>${esc(label)}</option>`).join("")}</select></label><div class="view-toggle" role="group" aria-label="Layout" data-spec="teams.layout-toggle" data-spec-label="Cards and rows toggle">${["cards", "rows"]
    .map((layout) => `<button type="button" data-action="teams-layout" data-layout="${layout}" aria-pressed="${state.teamsLayout === layout}">${icon(layout === "cards" ? "grid" : "menu")}${layout === "cards" ? "Cards" : "Rows"}</button>`)
    .join("")}</div></div>`;
}
function teamsBulkBar() {
  const n = state.teamSel.length;
  return `<div class="bulk-bar" role="region" aria-label="Bulk Actions" data-spec="teams.bulk-bar" data-spec-label="Teams bulk bar"><span class="bulk-count" role="status">${pluralize(n, "team")} selected</span><div class="bulk-actions"><button type="button" class="button small" data-action="teams-bulk-delete">Delete…</button></div><button type="button" class="bulk-clear" data-action="teams-bulk-clear" aria-label="Clear Selection">Clear${icon("close")}</button></div>`;
}
function teamMenu(t, where) {
  const open = state.teamMenu === `${where}:${t.id}`;
  const canManage = actorCanBulk();
  return `<div class="menu-anchor team-menu-anchor"><button type="button" class="icon-btn kebab" data-action="team-menu" data-team="${esc(t.id)}" data-where="${where}" aria-label="Actions for ${esc(t.name)}" aria-haspopup="menu" aria-expanded="${open}">${menuIcon()}</button>${
    open
      ? `<div class="dropdown-menu team-dropdown" role="menu"><button type="button" role="menuitem" data-action="team-open" data-team="${esc(t.id)}">Open Team</button>${canManage ? `<button type="button" role="menuitem" data-action="team-edit" data-team="${esc(t.id)}">Edit Details</button><button type="button" role="menuitem" class="danger" data-action="team-delete" data-team="${esc(t.id)}">Delete Team…</button>` : ""}</div>`
      : ""
  }</div>`;
}
function faces(people) {
  const shown = people.slice(0, 3);
  return `<span class="faces" aria-hidden="true">${shown.map((p) => `<span class="face">${esc(initial(p.name))}</span>`).join("")}${people.length > 3 ? `<span class="face more">+${people.length - 3}</span>` : ""}</span>`;
}
function accessLine(t) {
  if (!t.access.length) return "";
  if (t.access.length <= 2) return `${t.access.map((p) => esc(shortName(p.name))).join(" and ")} can see this team`;
  return `${pluralize(t.access.length, "person", "people")} can see this team`;
}
// Each team gets a two-letter tile in one of a few soft tints. Tints follow the order teams were created in,
// so neighbours differ and a team keeps its colour when the list is sorted or filtered.
var TEAM_TINTS = [
  ["#e2f3f7", "#00627a"],
  ["#e8ecfb", "#3843a3"],
  ["#f1eafb", "#6b3fa0"],
  ["#fdf3e1", "#8a4b00"],
  ["#e6f6ee", "#0f6b45"],
  ["#fbeaee", "#a02c4a"],
];
function teamMonogram(t) {
  const order = teamRecords().findIndex((team) => team.id === t.id);
  const [bg, fg] = TEAM_TINTS[Math.max(order, 0) % TEAM_TINTS.length];
  const words = t.name.replace(/&/g, " ").split(/\s+/).filter(Boolean);
  const letters = `${words[0]?.[0] || ""}${words[1]?.[0] || ""}`.toUpperCase();
  return `<span class="team-mono" style="--team-bg:${bg};--team-fg:${fg}" aria-hidden="true">${esc(letters)}</span>`;
}
function teamCard(t) {
  const canManage = actorCanBulk();
  const selected = state.teamSel.includes(t.id);
  const empty = !t.members.length;
  const count = (status) => t.members.filter((u) => u.status === status).length;
  const active = count("Active");
  const suspended = count("Suspended");
  const legend = [
    [active, "active"],
    [t.pending, "pending"],
    [t.needsVoucher, t.needsVoucher === 1 ? "needs a voucher" : "need a voucher"],
    [suspended, "suspended"],
  ]
    .filter(([n]) => n)
    .map(([n, label]) => `${n} ${label}`)
    .join(" · ");
  const bar = [
    ["ok", active],
    ["warn", t.pending + t.needsVoucher],
    ["off", suspended],
  ]
    .filter(([, n]) => n)
    .map(([tone, n]) => `<span class="${tone}" style="flex-grow:${n}"></span>`)
    .join("");
  const body = empty
    ? `<div class="team-card-empty"><span>No Members Yet</span>${canManage ? `<button type="button" class="button-link team-foot-action" data-action="team-add-students" data-team="${esc(t.id)}">Add Students</button>` : ""}</div>`
    : `<div class="team-figure"><span class="team-figure-num">${t.members.length}</span><span class="team-figure-unit">${t.members.length === 1 ? "member" : "members"}</span><span class="team-figure-groups">${pluralize(t.groups.length, "admin group")}</span></div><div class="team-status-bar" aria-hidden="true">${bar}</div><p class="team-status-legend">${legend}</p>`;
  const foot = empty
    ? ""
    : `<div class="team-card-foot">${
        t.access.length
          ? `${faces(t.access)}<span class="team-foot-text">${accessLine(t)}</span>`
          : `<span class="team-flag">Not Visible to Anyone</span><span class="team-foot-spacer"></span>${canManage ? `<button type="button" class="button-link team-foot-action" data-action="team-give-access-from-list" data-team="${esc(t.id)}">Give Access</button>` : ""}`
      }</div>`;
  return `<article class="team-card${empty ? " is-empty" : ""}${selected ? " is-selected" : ""}${state.highlightTeam === t.id ? " is-new" : ""}" aria-labelledby="team-card-${esc(t.id)}" data-spec="teams.card" data-spec-label="Team card"><div class="team-card-top">${teamMonogram(t)}<div class="team-card-title"><h2 id="team-card-${esc(t.id)}"><button type="button" class="team-card-link" data-action="team-open" data-team="${esc(t.id)}">${esc(t.name)}</button></h2><p class="${t.description ? "" : "is-missing"}">${esc(t.description || "No Description")}</p></div>${canManage ? `<input type="checkbox" class="row-check team-check" data-team-select="${esc(t.id)}" aria-label="Select ${esc(t.name)}" ${selected ? "checked" : ""}>` : ""}${teamMenu(t, "card")}</div>${body}${foot}</article>`;
}
function teamRow(t) {
  const canManage = actorCanBulk();
  const selected = state.teamSel.includes(t.id);
  return `<tr data-team-row="${esc(t.id)}" tabindex="0" class="${selected ? "is-selected" : ""}">${canManage ? `<td class="selection-col"><input type="checkbox" class="row-check team-check" data-team-select="${esc(t.id)}" aria-label="Select ${esc(t.name)}" ${selected ? "checked" : ""}></td>` : ""}<td><div class="person-name">${esc(t.name)}</div><div class="secondary${t.description ? "" : " is-missing"}">${esc(t.description || "No Description")}</div></td><td class="num">${t.members.length || `<span class="team-flag muted">Empty</span>`}</td><td class="num">${t.groups.length}</td><td>${t.access.length ? `<span class="access-cell">${faces(t.access)}<span>${t.access.map((p) => esc(shortName(p.name))).slice(0, 2).join(", ")}${t.access.length > 2 ? ` +${t.access.length - 2}` : ""}</span></span>` : `<span class="team-flag">Not Visible to Anyone</span>`}</td><td class="secondary">${esc(teamDayLabel(t.last))}</td><td class="menu-cell">${teamMenu(t, "row")}</td></tr>`;
}
function teamsListView() {
  teamsState();
  const canManage = actorCanBulk();
  const all = teamRecords().map(teamSummary);
  const chip = TEAMS_CHIPS.find(([key]) => key === state.teamsChip) || TEAMS_CHIPS[0];
  const sort = TEAMS_SORTS.find(([key]) => key === state.teamsSort) || TEAMS_SORTS[0];
  const q = state.teamsQuery.trim().toLowerCase();
  const shown = all
    .filter((t) => chip[2](t) && (!q || `${t.name} ${t.description || ""}`.toLowerCase().includes(q)))
    .sort(sort[2]);
  state.teamSel = state.teamSel.filter((id) => all.some((t) => t.id === id));
  const empty = !shown.length
    ? `<div class="empty teams-empty">${icon("search")}<h2>No Teams Match</h2><p>Try another search or clear the filter.</p>${btn("Clear Filters", "teams-clear-filters")}</div>`
    : "";
  const body =
    state.teamsLayout === "rows"
      ? `<div class="table-wrap" data-spec="teams.rows" data-spec-label="Teams table"><table class="teams-table"><thead><tr>${canManage ? `<th class="selection-col"><input type="checkbox" class="row-check team-check" data-team-select="all" aria-label="Select all visible teams" ${shown.length && shown.every((t) => state.teamSel.includes(t.id)) ? "checked" : ""}></th>` : ""}<th>Team</th><th class="num">Members</th><th class="num">Admin Groups</th><th>Portal Users With Access</th><th>Last Change</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${shown.map(teamRow).join("")}</tbody></table></div>${empty}`
      : `${empty}<div class="team-grid">${shown.map(teamCard).join("")}${canManage && state.teamsChip === "all" && !q ? `<button type="button" class="team-card team-card-new" data-action="create-team" data-spec="teams.create-card" data-spec-label="Create team card">${icon("plus")}<span>Create Team</span></button>` : ""}</div>`;
  return `${heading("Teams", "Group students for reporting. Teams don't give anyone access to training or funding.", canManage ? btn(icon("plus") + "Create Team", "create-team", "primary") : "")}${teamsHealth(all)}<section class="card teams-card" aria-label="Teams">${state.teamSel.length ? teamsBulkBar() : teamsToolbar(all)}${body}</section>`;
}

// ---------- Team page ----------
var TEAM_MEMBER_CHIPS = [
  ["all", "All", () => true],
  ["pending", "Pending invite", (u) => u.status === "Pending invite"],
  ["needsVoucher", "Needs voucher", (u) => u.status === "Needs voucher"],
  ["noGroup", "No Admin Group", (u) => !u.groups.length],
];
function memberMatches(u) {
  const chip = TEAM_MEMBER_CHIPS.find(([key]) => key === state.teamChip) || TEAM_MEMBER_CHIPS[0];
  const q = state.teamSearch.trim().toLowerCase();
  return chip[2](u) && (!q || `${u.name} ${u.email}`.toLowerCase().includes(q));
}
function teamContext() {
  const team = currentTeam();
  const rows = team ? teamMembers(team) : [];
  return {
    key: "team",
    noun: ["student", "students"],
    rows,
    visible: rows.filter(memberMatches),
    run: storeRun,
    canEdit: actorCanBulk(),
    rowFor: (id) => rows.find((u) => u.id === id),
  };
}
function accessContext(team) {
  const rows = db.users.filter((u) => u.type === "portal");
  return { key: "teamAccess", noun: ["person", "people"], rows, visible: rows, run: storeRun, canEdit: actorCanBulk(), rowFor: (id) => rows.find((u) => u.id === id) };
}
function memberMenu(u) {
  const open = state.rowMenu === u.id;
  const canManage = actorCanBulk();
  return `<div class="menu-anchor row-menu-anchor"><button class="icon-btn kebab" aria-label="Actions for ${esc(u.name || u.email)}" aria-expanded="${open}" data-action="row-menu" data-id="${esc(u.id)}">${menuIcon()}</button>${
    open
      ? `<div class="dropdown-menu row-dropdown">${btn("Open Profile", "team-member-profile", "", `data-id="${esc(u.id)}"`)}${canManage ? `${btn("Move to Another Team…", "team-member-move", "", `data-id="${esc(u.id)}"`)}${btn("Remove From Team", "team-member-remove", "", `data-id="${esc(u.id)}"`)}` : ""}</div>`
      : ""
  }</div>`;
}
function membersPanel(team) {
  const canManage = actorCanBulk();
  const ctx = teamContext();
  const rows = ctx.visible;
  const counts = Object.fromEntries(TEAM_MEMBER_CHIPS.map(([key, , test]) => [key, ctx.rows.filter(test).length]));
  const toolbarHtml = state.selected.length
    ? bulkBarHtml(ctx)
    : `<div class="team-members-toolbar"><div class="search">${icon("search")}<input id="team-member-search" placeholder="Search members" aria-label="Search members" value="${esc(state.teamSearch)}" autocomplete="off"></div><span class="teams-toolbar-spacer"></span>${canManage ? btn(icon("plus") + "Add Students", "team-add-students", "primary", `data-team="${esc(team.id)}" id="team-add-button"`) : ""}</div>`;
  if (!ctx.rows.length)
    return `<section class="card team-panel" aria-label="Members" data-spec="team.empty" data-spec-label="Empty Team"><div class="empty team-empty">${icon("users")}<h2>No Members Yet</h2><p>Add students to start reporting on ${esc(team.name)}. You can pick people who are already students, paste a list of emails, or upload a CSV.</p>${canManage ? btn("Add Students", "team-add-students", "primary", `data-team="${esc(team.id)}" id="team-add-button"`) : ""}</div></section>`;
  const chips = `<div class="chip-bar" role="group" aria-label="Quick filters">${TEAM_MEMBER_CHIPS.map(
    ([key, label]) => `<button type="button" class="filter-chip${state.teamChip === key ? " active" : ""}" data-action="team-chip" data-chip="${key}" aria-pressed="${state.teamChip === key}">${esc(label)}<span class="chip-count">${counts[key]}</span></button>`,
  ).join("")}</div>`;
  const allChecked = rows.length > 0 && rows.every((u) => state.selected.includes(u.id));
  return `<section class="card people-card team-panel" aria-label="Members" data-spec="team.members" data-spec-label="Members table">${toolbarHtml}${chips}<div class="table-wrap"><table class="people-table team-members-table"><colgroup><col class="col-check"><col class="col-person"><col class="col-group"><col class="col-voucher"><col class="col-status"><col class="col-menu"></colgroup><thead><tr><th class="selection-col">${canManage ? checkRow("all", allChecked, "Select all visible members") : ""}</th><th>Name</th><th>Admin Group</th><th>Voucher</th><th>Status</th><th></th></tr></thead><tbody>${
    rows.length
      ? rows
          .map(
            (u) =>
              `<tr${rowHighlight(u)}><td class="selection-col">${canManage ? checkRow(u.id, state.selected.includes(u.id), "Select " + (u.name || u.email)) : `<input type="hidden" data-select="${esc(u.id)}">`}</td><td><div class="person-name">${esc(u.name || u.email)}</div>${personMeta(u, u.email)}</td><td class="scope">${u.groups.length ? esc(u.groups[0]) : canManage && u.vouchers.length ? `<button type="button" class="inline-assignment" data-action="cell-pick" data-kind="adminGroup" data-row="${esc(u.id)}">${icon("plus")}Set Admin Group</button>` : `<span class="unassigned">None</span>`}</td><td class="scope">${u.vouchers.length ? esc(u.vouchers[0]) : voucherFlag(u) || `<span class="unassigned">None</span>`}</td><td class="status-cell">${labelStatus(u.status)}</td><td class="menu-cell">${memberMenu(u)}</td></tr>`,
          )
          .join("")
      : `<tr><td colspan="6"><div class="empty">${icon("search")}<h2>No Members Match</h2><p>Try another name or clear the filter.</p>${btn("Clear Filters", "team-clear-filters")}</div></td></tr>`
  }</tbody></table></div></section>`;
}
function accessPanel(team) {
  const canManage = actorCanBulk();
  const people = teamAccess(team);
  const intro = `<div class="team-panel-head"><p>Portal users with access can see this team's students and reports. They aren't members, and access doesn't change their role.</p>${canManage ? btn(icon("plus") + "Give Access", "team-give-access", "primary", 'id="team-give-access"') : ""}</div>`;
  if (!people.length)
    return `<section class="card team-panel" aria-label="Portal Users With Access" data-spec="team.access" data-spec-label="Portal Users With Access">${intro}<div class="empty team-empty">${icon("groups")}<h2>Nobody Can See This Team Yet</h2><p>Until someone has access, ${esc(team.name)}'s progress doesn't appear in anyone's reports.</p></div></section>`;
  return `<section class="card team-panel" aria-label="Portal Users With Access" data-spec="team.access" data-spec-label="Portal Users With Access">${intro}<div class="table-wrap"><table class="teams-table access-table"><thead><tr><th>Name</th><th>Role</th><th>Other Teams They Can See</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${people
    .map((u) => {
      const others = u.teams.filter((name) => name !== team.name);
      return `<tr${rowHighlight(u)}><td><div class="person-name">${esc(u.name)}</div><div class="secondary">${esc(u.email)}</div></td><td>${esc(u.role)}</td><td class="secondary">${others.length ? esc(others.length > 3 ? `${others.slice(0, 3).join(", ")} +${others.length - 3}` : others.join(", ")) : "This Team Only"}</td><td>${labelStatus(u.status)}</td><td class="menu-cell">${canManage ? `<button type="button" class="button small text" data-action="team-remove-access" data-id="${esc(u.id)}">Remove Access</button>` : ""}</td></tr>`;
    })
    .join("")}</tbody></table></div></section>`;
}
function historyPanel(team) {
  const all = store.snapshot().events;
  const events = teamEvents(team);
  const visible = events.slice(0, state.teamHistoryShown);
  if (!events.length)
    return `<section class="card team-panel" aria-label="History"><div class="empty team-empty">${icon("schedule")}<h2>No History Yet</h2><p>Changes to this team and its members will appear here.</p></div></section>`;
  return `<section class="card team-panel team-history" aria-label="History" data-spec="team.history" data-spec-label="Team History">${groupEventsByDay(visible)
    .map(
      (group) =>
        `<section class="activity-day"><h3>${esc(group.label)}</h3><ul aria-label="Activity on ${esc(group.label)}">${group.events.map((event) => activityEntryHtml(event, all, state.teamHistoryOpen.includes(event.id), "team-history-toggle")).join("")}</ul></section>`,
    )
    .join("")}${events.length > visible.length ? `<div class="activity-more">${btn(`Show More (${events.length - visible.length})`, "team-history-more", "small")}</div>` : ""}</section>`;
}
function teamPageView() {
  teamsState();
  const team = currentTeam();
  if (!team) {
    state.teamId = null;
    return teamsListView();
  }
  const s = teamSummary(team);
  const canManage = actorCanBulk();
  const tabs = [
    ["members", "Members", s.members.length],
    ["access", "Portal Users With Access", s.access.length],
    ["history", "History", null],
  ];
  const created = `Created by ${esc(personName(team.createdBy))} · ${esc(teamDayLabel(team.createdAt))}`;
  const changed = s.last && s.last !== team.createdAt ? ` · Last change ${esc(teamDayLabel(s.last).toLowerCase() === "today" ? "today" : teamDayLabel(s.last))}` : "";
  const panel = state.teamTab === "access" ? accessPanel(team) : state.teamTab === "history" ? historyPanel(team) : membersPanel(team);
  return `<button class="back" data-action="teams-back">${icon("back")}Teams</button><div class="page-head team-head" data-spec="team.header" data-spec-label="Team header"><div><h1>${esc(team.name)}</h1><p class="muted">${team.description ? esc(team.description) : canManage ? `<button type="button" class="button-link" data-action="team-edit" data-team="${esc(team.id)}">Add a Description</button> so people can tell similar teams apart.` : "No Description"}</p><p class="team-meta">${created}${changed}</p></div><div class="head-actions">${btn(icon("arrow") + "View Training Progress", "team-progress", "", `data-team="${esc(team.id)}"`)}${canManage ? teamMenu(team, "page") : ""}</div></div><div class="team-tabs" data-spec="team.tabs" data-spec-label="Team tabs" role="tablist" aria-label="${esc(team.name)}">${tabs
    .map(
      ([key, label, count]) =>
        `<button type="button" role="tab" id="team-tab-${key}" aria-selected="${state.teamTab === key}" data-action="team-tab" data-tab="${key}">${esc(label)}${count === null ? "" : `<span class="tab-count">${count}</span>`}</button>`,
    )
    .join("")}</div><div role="tabpanel" aria-labelledby="team-tab-${state.teamTab}">${panel}</div>`;
}

// ---------- Wiring into the app ----------
const teamsBaseContent = content;
content = function () {
  if (state.view === "teams") return state.teamId ? teamPageView() : teamsListView();
  const html = teamsBaseContent();
  if (state.view === "profile" && state.profileReturnTeam) {
    const team = teamById(state.profileReturnTeam);
    if (team)
      return html.replace(
        /<button class="back" data-action="navigate" data-view="students">[\s\S]*?<\/button>/,
        `<button class="back" data-action="team-return">${icon("back")}Back to ${esc(team.name)}</button>`,
      );
  }
  return html;
};
const teamsBaseBulkContext = bulkContext;
bulkContext = function () {
  if (state.view === "teams" && state.teamId && (state.teamTab || "members") === "members") return teamContext();
  return teamsBaseBulkContext();
};
const teamsBaseMainActions = mainActions;
mainActions = function (ctx) {
  if (ctx.key === "team") return [["team-move", "Move to Another Team"], ["adminGroup", "Set Admin Group"], ["team-remove", "Remove From Team"]];
  return teamsBaseMainActions(ctx);
};
const teamsBaseMoreItems = moreMenuItems;
moreMenuItems = function (ctx) {
  if (ctx.key === "team") return [["export", "Export Selected"]];
  return teamsBaseMoreItems(ctx);
};
const teamsBaseBulkPicker = openBulkPicker;
openBulkPicker = function (ctx, kind, anchor) {
  if (ctx.key === "team" && kind === "team-move") return openMovePicker(selectedRows(ctx), anchor, `[data-action="bulk-open"][data-kind="team-move"]`);
  if (ctx.key === "team" && kind === "team-remove") return removeMembers(selectedRows(ctx));
  return teamsBaseBulkPicker(ctx, kind, anchor);
};
const teamsBaseOpenProfile = openProfile;
openProfile = function (id) {
  const fromTeam = state.view === "teams" && state.teamId ? state.teamId : null;
  teamsBaseOpenProfile(id);
  state.profileReturnTeam = fromTeam;
  if (fromTeam) render();
};

// ---------- Moving and removing members ----------
function openMovePicker(rows, anchor, returnSelector) {
  const team = currentTeam();
  const others = db.teams.filter((name) => name !== team.name);
  openPopover(anchor, {
    title: rows.length === 1 ? `Move ${rows[0].name || rows[0].email} to` : `Move ${pluralize(rows.length, "student")} to`,
    items: others.map((name) => ({ value: name, label: name })),
    placeholder: "Search teams",
    returnSelector,
    footer: [{ label: "Create a New Team", run: () => createTeamThen((name) => moveMembers(rows, name)) }],
    onPick: (name) => moveMembers(rows, name),
  });
}
function finishMemberChange(result, message, extra = []) {
  state.selected = [];
  state.rowMenu = null;
  const ctx = teamContext();
  const actions = [];
  if (result.applied.length && result.undoId) actions.push({ label: "Undo", run: () => undoBulk(ctx, result) });
  actions.push(...extra);
  if (result.skipped.length) actions.push({ label: "Details", run: () => showBulkResult(ctx, "team", {}, result) });
  const skipped = result.skipped.length ? ` · ${result.skipped.length} skipped` : "";
  toastWith(result.applied.length ? message + skipped : `No changes made${skipped}`, actions);
  render();
}
function moveMembers(rows, name) {
  const target = teamRecords().find((t) => t.name === name);
  const result = storeRun("team", rows.map((r) => r.id), { team: name });
  if (!result) return;
  finishMemberChange(result, `Moved ${pluralize(result.applied.length, "student")} to ${name}`, target ? [{ label: "View Team", run: () => openTeam(target.id) }] : []);
}
function removeMembers(rows) {
  const team = currentTeam();
  const result = storeRun("team", rows.map((r) => r.id), { team: "" });
  if (!result) return;
  finishMemberChange(result, `Removed ${pluralize(result.applied.length, "student")} from ${team.name}. They're still students.`);
}

// ---------- Navigation ----------
function openTeam(id, tab = "members") {
  teamsState();
  state.teamId = id;
  state.teamTab = tab;
  state.teamSearch = "";
  state.teamChip = "all";
  state.teamHistoryShown = 20;
  state.teamMenu = null;
  state.profileReturnTeam = null;
  navigate("teams");
}
function leaveTeam() {
  state.teamId = null;
  state.teamMenu = null;
  navigate("teams");
}

// ---------- Create, edit and delete ----------
function teamForm({ title, submit, name = "", description = "", id = "" }) {
  state.modal = "team-form";
  openModal(
    title,
    "",
    `<form id="team-form" data-team="${esc(id)}"><div class="field"><label for="team-form-name">Team Name</label><input id="team-form-name" name="name" required autocomplete="off" value="${esc(name)}" placeholder="For example, Cloud Platform"></div><div class="field"><label for="team-form-description">Description <span class="optional">Optional</span></label><textarea id="team-form-description" name="description" rows="3" placeholder="What this team does, so people can tell it apart from similar teams">${esc(description)}</textarea></div><p class="inline-error" id="team-form-error" role="alert"></p><p class="hint">Teams are for reporting. Adding someone to a team doesn't change their voucher, admin group or access.</p></form>`,
    `<div class="actions">${btn("Cancel", "close-modal", "text")}<button class="button primary" type="submit" form="team-form">${esc(submit)}</button></div>`,
    "",
    true,
  );
  $("#team-form-name")?.focus();
}
function openDeleteTeam(id) {
  const team = teamById(id);
  if (!team) return;
  const s = teamSummary(team);
  const others = db.teams.filter((name) => name !== team.name);
  state.modal = "team-delete";
  state.deleteTeamId = id;
  const members = s.members.length;
  const move = members
    ? `<p>${pluralize(members, "student is", "students are")} in this team. Choose where ${members === 1 ? "they go" : "they go"}:</p><div class="choice-list" role="radiogroup" aria-label="Where Members Go">${
        others.length
          ? `<label class="choice"><input type="radio" name="team-delete-mode" value="move" checked><span>Move Them To</span><select id="team-delete-target" aria-label="Team to Move Them To">${others.map((name) => `<option>${esc(name)}</option>`).join("")}</select></label>`
          : ""
      }<label class="choice"><input type="radio" name="team-delete-mode" value="clear" ${others.length ? "" : "checked"}><span>Leave them with no team</span></label></div>`
    : `<p>${esc(team.name)} has no members.</p>`;
  const names = s.access.map((p) => esc(p.name));
  const access = names.length
    ? `<p class="bulk-line">${names.length > 3 ? `${names.slice(0, 2).join(", ")} and ${names.length - 2} others` : names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0]} will lose access to this team.</p>`
    : "";
  openModal(
    `Delete ${esc(team.name)}?`,
    "",
    `<div data-spec="teams.delete-dialog" data-spec-label="Delete team dialog">${move}${access}<p class="hint">Its history stays in the activity log. Reports already run keep the team's name.</p></div>`,
    `<div class="actions">${btn("Cancel", "close-modal", "text")}${btn(members ? `Move ${members} and delete` : "Delete Team", "team-delete-confirm", "danger", 'id="team-delete-confirm"')}</div>`,
    "",
    true,
  );
}
function syncDeleteLabel() {
  const button = $("#team-delete-confirm");
  const team = teamById(state.deleteTeamId);
  if (!button || !team) return;
  const members = teamMembers(team).length;
  if (!members) return;
  const mode = document.querySelector("input[name=team-delete-mode]:checked")?.value;
  button.textContent = mode === "move" ? `Move ${members} and delete` : "Delete Team";
}
function confirmDeleteTeam() {
  const team = teamById(state.deleteTeamId);
  if (!team) return;
  const members = teamMembers(team);
  const mode = document.querySelector("input[name=team-delete-mode]:checked")?.value;
  const target = $("#team-delete-target")?.value;
  try {
    let lost = 0;
    dispatch((st) => {
      if (members.length) st.bulk("team", members.map((u) => u.id), { team: mode === "move" ? target : "" });
      lost = st.deleteTeam(team.id);
    });
    $("#modal").close();
    state.modal = null;
    state.teamSel = (state.teamSel || []).filter((id) => id !== team.id);
    if (state.teamId === team.id) state.teamId = null;
    navigate("teams");
    toast(`Deleted ${team.name}${members.length ? `. ${pluralize(members.length, "student")} ${mode === "move" ? `moved to ${target}` : "now in no team"}` : ""}${lost ? `. ${pluralize(lost, "person", "people")} lost access` : ""}.`);
  } catch (error) {
    db = store.view();
    render();
    toast(error.message);
  }
}
function openBulkDeleteTeams() {
  const chosen = state.teamSel.map(teamById).filter(Boolean).map(teamSummary);
  const deletable = chosen.filter((t) => !t.members.length);
  const kept = chosen.filter((t) => t.members.length);
  state.modal = "teams-bulk-delete";
  state.bulkDeleteIds = deletable.map((t) => t.id);
  openModal(
    deletable.length ? `Delete ${pluralize(deletable.length, "empty team")}?` : "These teams have members",
    "",
    `${deletable.length ? `<p class="bulk-line">${deletable.map((t) => esc(t.name)).join(", ")}</p>` : ""}${deletable.some((t) => t.access.length) ? `<p class="bulk-line">Portal users with access to ${deletable.length === 1 ? "it" : "them"} will lose that access.</p>` : ""}${kept.length ? `<div class="bulk-skipped"><p><strong>${pluralize(kept.length, "team")} will be kept</strong></p><ul>${kept.map((t) => `<li><strong>${esc(t.name)}</strong>: ${pluralize(t.members.length, "member")}. Open the team to move them, then delete it.</li>`).join("")}</ul></div>` : ""}`,
    `<div class="actions">${btn(deletable.length ? "Cancel" : "Close", "close-modal", deletable.length ? "text" : "primary")}${deletable.length ? btn(`Delete ${pluralize(deletable.length, "team")}`, "teams-bulk-delete-confirm", "danger") : ""}</div>`,
    "",
    true,
  );
}
function confirmBulkDeleteTeams() {
  const ids = state.bulkDeleteIds || [];
  try {
    dispatch((st) => ids.forEach((id) => st.deleteTeam(id)));
    $("#modal").close();
    state.modal = null;
    state.teamSel = [];
    render();
    toast(`Deleted ${pluralize(ids.length, "team")}`);
  } catch (error) {
    db = store.view();
    render();
    toast(error.message);
  }
}

// ---------- Portal users with access ----------
function openGiveAccess(team, anchor) {
  const people = db.users.filter((u) => u.type === "portal" && !u.teams.includes(team.name));
  if (!people.length) return toast("Every portal user already has access to this team.");
  openPopover(anchor, {
    title: `Give access to ${team.name}`,
    items: people.map((u) => ({ value: u.id, label: `${u.name} · ${u.role}` })),
    multi: true,
    placeholder: "Search portal users",
    note: "They'll see this team's students and reports. Their role doesn't change.",
    applyLabel: "Give Access",
    returnSelector: "#team-give-access",
    onPick: (ids) => {
      const ctx = accessContext(team);
      runBulkFlow(ctx, "portalAccess", { field: "team", mode: "add", names: [team.name] }, ids.map((id) => ctx.rowFor(id)).filter(Boolean));
    },
  });
}

// ---------- Add students panel ----------
function addPanelState() {
  return state.addPanel;
}
function openAddPanel(teamId) {
  const team = teamById(teamId);
  if (!team) return;
  state.addPanel = { teamId, tab: "choose", q: "", team: "any", group: "any", voucher: "any", picked: [], pasted: "", note: "", returnFocus: document.activeElement?.id || "team-add-button" };
  let root = document.getElementById("team-drawer");
  if (!root) {
    root = document.createElement("div");
    root.id = "team-drawer";
    document.body.append(root);
  }
  document.body.classList.add("drawer-open");
  paintAddPanel();
  requestAnimationFrame(() => root.querySelector(".side-drawer")?.classList.add("is-open"));
  setTimeout(() => $("#drawer-search")?.focus(), 30);
}
function closeAddPanel() {
  const root = document.getElementById("team-drawer");
  const panel = state.addPanel;
  state.addPanel = null;
  document.body.classList.remove("drawer-open");
  if (root) root.innerHTML = "";
  if (panel?.returnFocus) document.getElementById(panel.returnFocus)?.focus();
}
function addCandidates(p, team) {
  const q = p.q.trim().toLowerCase();
  return db.users
    .filter((u) => u.type === "student")
    .filter((u) => !q || `${u.name} ${u.email}`.toLowerCase().includes(q))
    .filter((u) => p.team === "any" || (p.team === "none" ? !u.teams.length : u.teams.includes(p.team)))
    .filter((u) => p.group === "any" || (p.group === "none" ? !u.groups.length : u.groups.includes(p.group)))
    .filter((u) => p.voucher === "any" || (p.voucher === "none" ? !u.vouchers.length : u.vouchers.includes(p.voucher)))
    .sort((a, b) => Number(a.teams.includes(team.name)) - Number(b.teams.includes(team.name)) || (a.name || a.email).localeCompare(b.name || b.email));
}
function parsePasted(text, team) {
  const tokens = String(text || "").split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean);
  const seen = new Set();
  const out = { found: [], already: [], unknown: [], invalid: [] };
  for (const token of tokens) {
    const email = token.replace(/^<|>$/g, "").toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      out.invalid.push(token);
      continue;
    }
    const student = db.users.find((u) => u.type === "student" && u.email.toLowerCase() === email);
    if (!student) out.unknown.push(email);
    else if (student.teams.includes(team.name)) out.already.push(student);
    else out.found.push(student);
  }
  return out;
}
function selectFilter(id, label, value, options) {
  return `<label class="drawer-filter" for="${id}"><span>${label}</span><select id="${id}">${options.map(([v, text]) => `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(text)}</option>`).join("")}</select></label>`;
}
function paintAddPanel() {
  const root = document.getElementById("team-drawer");
  const p = addPanelState();
  if (!root || !p) return;
  const team = teamById(p.teamId);
  if (!team) return closeAddPanel();
  const focus = document.activeElement?.id;
  const caret = document.activeElement?.selectionStart;
  const listScroll = root.querySelector(".drawer-list")?.scrollTop || 0;
  const wasOpen = root.querySelector(".side-drawer")?.classList.contains("is-open");
  const picked = p.picked.map((id) => db.users.find((u) => u.id === id)).filter(Boolean);
  const moving = picked.filter((u) => u.teams.length).length;
  const fresh = picked.length - moving;
  let body;
  if (p.tab === "paste") {
    const r = parsePasted(p.pasted, team);
    const lines = [
      r.found.length ? `<li class="ok">${icon("check_circle")}<span><strong>${pluralize(r.found.length, "student")} found</strong>${r.found.length ? ` · ${esc(r.found.slice(0, 3).map((u) => u.name || u.email).join(", "))}${r.found.length > 3 ? ` and ${r.found.length - 3} more` : ""}` : ""}</span></li>` : "",
      r.already.length ? `<li class="muted">${icon("info")}<span>${pluralize(r.already.length, "is", "are")} already in ${esc(team.name)}</span></li>` : "",
      r.unknown.length ? `<li class="warn">${icon("info")}<span><strong>${pluralize(r.unknown.length, "email isn't", "emails aren't")} a student yet.</strong> You can add ${r.unknown.length === 1 ? "them" : "them"} as new students, already placed in this team.</span></li>` : "",
      r.invalid.length ? `<li class="error">${icon("error")}<span>${pluralize(r.invalid.length, "entry doesn't", "entries don't")} look like an email: ${esc(r.invalid.slice(0, 3).join(", "))}</span></li>` : "",
    ].join("");
    body = `<div class="drawer-section"><label for="drawer-paste" class="drawer-label">Paste Email Addresses</label><p class="drawer-hint">One per line, or separated by commas. Straight from a spreadsheet column or an email works.</p><textarea id="drawer-paste" rows="7" placeholder="amara.okafor@northwind.example">${esc(p.pasted)}</textarea>${lines ? `<ul class="paste-results">${lines}</ul>` : ""}<div class="paste-actions">${r.found.length ? btn(`Select ${pluralize(r.found.length, "student")}`, "drawer-select-pasted", "small primary") : ""}${r.unknown.length ? btn(`Add ${r.unknown.length} new ${r.unknown.length === 1 ? "student" : "students"}…`, "drawer-invite-new", "small") : ""}</div></div>`;
  } else {
    const list = addCandidates(p, team);
    const eligible = list.filter((u) => !u.teams.includes(team.name));
    const allOn = eligible.length > 0 && eligible.every((u) => p.picked.includes(u.id));
    body = `<div class="drawer-section"><div class="search drawer-search">${icon("search")}<input id="drawer-search" placeholder="Search name or email" aria-label="Search students" value="${esc(p.q)}" autocomplete="off"></div><div class="drawer-filters">${selectFilter("drawer-team", "Team", p.team, [["any", "Any Team"], ["none", "No Team"], ...db.teams.filter((n) => n !== team.name).map((n) => [n, n])])}${selectFilter("drawer-group", "Admin Group", p.group, [["any", "Any"], ["none", "No Admin Group"], ...db.groups.map((n) => [n, n])])}${selectFilter("drawer-voucher", "Voucher", p.voucher, [["any", "Any"], ["none", "No Voucher"], ...db.vouchers.map((n) => [n, n])])}</div>${p.note ? `<p class="drawer-note" role="status">${icon("check_circle")}${esc(p.note)}</p>` : ""}<label class="drawer-select-all"><input type="checkbox" class="row-check" id="drawer-all" ${allOn ? "checked" : ""} ${eligible.length ? "" : "disabled"}><span>Select all ${eligible.length} matching</span></label><div class="drawer-list" role="group" aria-label="Students">${
      list.length
        ? list
            .slice(0, 300)
            .map((u) => {
              const inTeam = u.teams.includes(team.name);
              const where = inTeam ? `Already in ${team.name}` : u.teams.length ? `In ${u.teams[0]}` : "No Team";
              return `<label class="drawer-person${inTeam ? " is-disabled" : ""}${p.picked.includes(u.id) ? " is-picked" : ""}"><input type="checkbox" class="row-check" data-pick="${esc(u.id)}" ${p.picked.includes(u.id) ? "checked" : ""} ${inTeam ? "disabled" : ""}><span class="face">${esc(initial(u.name || u.email))}</span><span class="drawer-person-text"><strong>${esc(u.name || u.email)}</strong><span>${esc(where)}${u.groups.length ? ` · ${esc(u.groups[0])}` : ""}</span></span>${!inTeam && u.teams.length ? `<span class="move-tag">Moves</span>` : ""}</label>`;
            })
            .join("")
        : `<p class="drawer-empty">No students match. Try another search or filter, or paste emails to add new students.</p>`
    }</div></div>`;
  }
  const summary = picked.length
    ? `<strong>${pluralize(picked.length, "student")} selected</strong><span>${[moving ? `${moving} will move from ${moving === 1 ? "another team" : "other teams"}` : "", fresh ? `${fresh} ${fresh === 1 ? "has" : "have"} no team yet` : ""].filter(Boolean).join(" · ")}</span>`
    : `<strong>No one selected yet</strong><span>Pick students, or paste a list of emails</span>`;
  root.innerHTML = `<div class="drawer-backdrop" data-action="drawer-close"></div><aside class="side-drawer${wasOpen ? " is-open" : ""}" data-spec="teams.add-panel" data-spec-label="Add students panel" role="dialog" aria-modal="true" aria-labelledby="drawer-title"><header class="drawer-head"><div><p class="drawer-eyebrow">${esc(team.name)}</p><h2 id="drawer-title">Add Students</h2></div><button type="button" class="icon-btn" data-action="drawer-close" aria-label="Close">${icon("close")}</button></header><div class="drawer-tabs" role="tablist" aria-label="How to Add">${[
    ["choose", "Choose Students"],
    ["paste", "Paste Emails"],
  ]
    .map(([key, label]) => `<button type="button" role="tab" id="drawer-tab-${key}" aria-selected="${p.tab === key}" data-action="drawer-tab" data-tab="${key}">${label}</button>`)
    .join("")}<button type="button" class="drawer-csv" data-action="drawer-csv">${icon("upload")}Upload a CSV</button></div><div class="drawer-body">${body}</div><footer class="drawer-foot"><div class="drawer-summary" role="status">${summary}</div><div class="drawer-buttons">${btn("Cancel", "drawer-close", "text")}${btn(picked.length ? `Add ${pluralize(picked.length, "student")}` : "Add Students", "drawer-add", "primary", picked.length ? "" : "disabled")}</div></footer></aside>`;
  const list = root.querySelector(".drawer-list");
  if (list) list.scrollTop = listScroll;
  if (focus && document.getElementById(focus)) {
    const el = document.getElementById(focus);
    el.focus({ preventScroll: true });
    if (typeof caret === "number" && el.setSelectionRange) el.setSelectionRange(caret, caret);
  }
}
function addPicked() {
  const p = addPanelState();
  const team = teamById(p.teamId);
  const ids = [...p.picked];
  if (!ids.length || !team) return;
  closeAddPanel();
  if (state.teamId !== team.id) openTeam(team.id);
  const result = storeRun("team", ids, { team: team.name });
  if (!result) return;
  state.highlight = new Set(result.applied.map((a) => a.id));
  setTimeout(() => {
    state.highlight = null;
    if (state.view === "teams") render();
  }, 4000);
  const ctx = teamContext();
  const actions = [];
  if (result.applied.length && result.undoId) actions.push({ label: "Undo", run: () => undoBulk(ctx, result) });
  if (result.skipped.length) actions.push({ label: "Details", run: () => showBulkResult(ctx, "team", { team: team.name }, result) });
  toastWith(
    result.applied.length
      ? `Added ${pluralize(result.applied.length, "student")} to ${team.name}${result.skipped.length ? ` · ${result.skipped.length} skipped` : ""}`
      : `No changes made${result.skipped.length ? ` · ${result.skipped.length} skipped` : ""}`,
    actions,
  );
  state.teamTab = "members";
  render();
}
// Emails that aren't students yet go through the CSV review, with this team filled in.
function inviteNewFromPaste() {
  const p = addPanelState();
  const team = teamById(p.teamId);
  const { unknown } = parsePasted(p.pasted, team);
  if (!unknown.length) return;
  closeAddPanel();
  const cell = (v) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const csv = `Email,Team\r\n${unknown.map((email) => `${cell(email)},${cell(team.name)}`).join("\r\n")}\r\n`;
  stageCSV(csv, `New students for ${team.name}.csv`);
}
function trapDrawerFocus(event) {
  const root = document.getElementById("team-drawer");
  if (!root || !state.addPanel || event.key !== "Tab") return;
  const items = [...root.querySelectorAll(".side-drawer button:not([disabled]), .side-drawer input:not([disabled]), .side-drawer select, .side-drawer textarea")].filter((el) => el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0],
    last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

// ---------- Events ----------
document.addEventListener(
  "click",
  (event) => {
    const target = event.target.closest("[data-action]");
    // Clicking Teams in the sidebar always goes back to the list.
    if (target?.dataset.action === "navigate" && target.dataset.view === "teams") {
      state.teamId = null;
      state.teamMenu = null;
      return;
    }
    // A click on a team row (not on its controls) opens the team.
    if (!target) {
      const tr = event.target.closest("#main .teams-table tr[data-team-row]");
      if (tr && !event.target.closest("input,button,a,label,select,.menu-anchor")) openTeam(tr.dataset.teamRow);
      if (state.teamMenu && !event.target.closest(".team-menu-anchor")) {
        state.teamMenu = null;
        render();
      }
      return;
    }
    const a = target.dataset.action;
    const stop = () => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    if (state.teamMenu && a !== "team-menu" && !target.closest(".team-dropdown")) state.teamMenu = null;
    switch (a) {
      case "create-team":
        stop();
        teamForm({ title: "Create Team", submit: "Create Team" });
        return;
      case "team-open":
        stop();
        openTeam(target.dataset.team);
        return;
      case "teams-back":
      case "team-return": {
        stop();
        const id = a === "team-return" ? state.profileReturnTeam : null;
        if (id) openTeam(id);
        else leaveTeam();
        return;
      }
      case "team-menu": {
        stop();
        const key = `${target.dataset.where}:${target.dataset.team}`;
        state.teamMenu = state.teamMenu === key ? null : key;
        render();
        document.querySelector(".team-dropdown button")?.focus({ preventScroll: true });
        return;
      }
      case "team-edit": {
        stop();
        const team = teamById(target.dataset.team);
        state.teamMenu = null;
        render();
        if (team) teamForm({ title: "Edit Team Details", submit: "Save Changes", name: team.name, description: team.description || "", id: team.id });
        return;
      }
      case "team-delete":
        stop();
        state.teamMenu = null;
        render();
        openDeleteTeam(target.dataset.team);
        return;
      case "team-delete-confirm":
        stop();
        confirmDeleteTeam();
        return;
      case "teams-chip":
        stop();
        state.teamsChip = target.dataset.chip;
        render();
        return;
      case "teams-clear-filters":
        stop();
        state.teamsChip = "all";
        state.teamsQuery = "";
        render();
        return;
      case "teams-layout":
        stop();
        state.teamsLayout = target.dataset.layout;
        saveLayout(state.teamsLayout);
        render();
        document.querySelector(`[data-action="teams-layout"][data-layout="${state.teamsLayout}"]`)?.focus();
        return;
      case "teams-health": {
        stop();
        const go = target.dataset.go;
        if (go === "no-team") {
          chipKey().students = "noTeam";
          navigate("students");
        } else {
          state.teamsChip = state.teamsChip === go ? "all" : go;
          render();
        }
        return;
      }
      case "teams-bulk-clear":
        stop();
        state.teamSel = [];
        render();
        return;
      case "teams-bulk-delete":
        stop();
        openBulkDeleteTeams();
        return;
      case "teams-bulk-delete-confirm":
        stop();
        confirmBulkDeleteTeams();
        return;
      case "team-tab":
        stop();
        state.teamTab = target.dataset.tab;
        state.selected = [];
        state.rowMenu = null;
        render();
        document.getElementById(`team-tab-${state.teamTab}`)?.focus();
        return;
      case "team-chip":
        stop();
        state.teamChip = target.dataset.chip;
        render();
        return;
      case "team-clear-filters":
        stop();
        state.teamChip = "all";
        state.teamSearch = "";
        render();
        return;
      case "team-add-students":
        stop();
        if (state.teamId !== target.dataset.team) openTeam(target.dataset.team);
        openAddPanel(target.dataset.team);
        return;
      case "team-give-access-from-list":
        stop();
        openTeam(target.dataset.team, "access");
        setTimeout(() => {
          const button = $("#team-give-access");
          if (button) openGiveAccess(currentTeam(), button);
        }, 60);
        return;
      case "team-give-access":
        stop();
        openGiveAccess(currentTeam(), target);
        return;
      case "team-remove-access": {
        stop();
        const team = currentTeam();
        const ctx = accessContext(team);
        const row = ctx.rowFor(target.dataset.id);
        if (row) runBulkFlow(ctx, "portalAccess", { field: "team", mode: "remove", names: [team.name] }, [row]);
        return;
      }
      case "team-member-profile":
        stop();
        state.rowMenu = null;
        openProfile(target.dataset.id);
        return;
      case "team-member-move": {
        stop();
        const row = teamContext().rowFor(target.dataset.id);
        const kebab = document.querySelector(`[data-action="row-menu"][data-id="${target.dataset.id}"]`);
        state.rowMenu = null;
        render();
        const anchor = document.querySelector(`[data-action="row-menu"][data-id="${target.dataset.id}"]`) || kebab;
        if (row && anchor) openMovePicker([row], anchor, `[data-action="row-menu"][data-id="${target.dataset.id}"]`);
        return;
      }
      case "team-member-remove": {
        stop();
        const row = teamContext().rowFor(target.dataset.id);
        if (row) removeMembers([row]);
        return;
      }
      case "team-progress":
        stop();
        navigate("learning");
        toast("In the full product, this opens Learning filtered to this team.");
        return;
      case "team-history-toggle": {
        stop();
        const id = target.dataset.id;
        state.teamHistoryOpen = state.teamHistoryOpen.includes(id) ? state.teamHistoryOpen.filter((x) => x !== id) : [...state.teamHistoryOpen, id];
        render();
        document.querySelector(`[data-action="team-history-toggle"][data-id="${id}"]`)?.focus();
        return;
      }
      case "team-history-more":
        stop();
        state.teamHistoryShown += 20;
        render();
        return;
      // ----- Add students panel -----
      case "drawer-close":
        stop();
        closeAddPanel();
        return;
      case "drawer-tab":
        stop();
        state.addPanel.tab = target.dataset.tab;
        state.addPanel.note = "";
        paintAddPanel();
        document.getElementById(`drawer-tab-${state.addPanel.tab}`)?.focus();
        return;
      case "drawer-select-pasted": {
        stop();
        const p = state.addPanel;
        const { found } = parsePasted(p.pasted, teamById(p.teamId));
        p.picked = [...new Set([...p.picked, ...found.map((u) => u.id)])];
        p.tab = "choose";
        p.note = `${pluralize(found.length, "student")} from your list selected`;
        paintAddPanel();
        return;
      }
      case "drawer-invite-new":
        stop();
        inviteNewFromPaste();
        return;
      case "drawer-csv":
        stop();
        closeAddPanel();
        uploadForm();
        return;
      case "drawer-add":
        stop();
        addPicked();
        return;
    }
  },
  true,
);
document.addEventListener(
  "change",
  (event) => {
    const el = event.target;
    // Team cards and rows on the list
    if (el.dataset?.teamSelect) {
      event.stopImmediatePropagation();
      const all = teamRecords().map(teamSummary);
      if (el.dataset.teamSelect === "all") {
        const visibleIds = [...document.querySelectorAll("[data-team-select]")].map((b) => b.dataset.teamSelect).filter((id) => id !== "all");
        state.teamSel = el.checked ? [...new Set([...state.teamSel, ...visibleIds])] : state.teamSel.filter((id) => !visibleIds.includes(id));
      } else
        state.teamSel = el.checked ? [...new Set([...state.teamSel, el.dataset.teamSelect])] : state.teamSel.filter((id) => id !== el.dataset.teamSelect);
      state.teamSel = state.teamSel.filter((id) => all.some((t) => t.id === id));
      render();
      document.querySelector(`[data-team-select="${el.dataset.teamSelect}"]`)?.focus({ preventScroll: true });
      return;
    }
    // Member rows on a team page: "all" means the visible members of this team
    if (state.view === "teams" && state.teamId && el.dataset?.select) {
      event.stopImmediatePropagation();
      const visible = teamContext().visible.map((u) => u.id);
      if (el.dataset.select === "all")
        state.selected = el.checked ? [...new Set([...state.selected, ...visible])] : state.selected.filter((id) => !visible.includes(id));
      else
        state.selected = el.checked ? [...new Set([...state.selected, el.dataset.select])] : state.selected.filter((id) => id !== el.dataset.select);
      render();
      document.querySelector(`[data-select="${el.dataset.select}"]`)?.focus({ preventScroll: true });
      return;
    }
    if (el.id === "teams-sort") {
      state.teamsSort = el.value;
      render();
      $("#teams-sort")?.focus();
      return;
    }
    if (el.name === "team-delete-mode") return syncDeleteLabel();
    // Add students panel
    const p = state.addPanel;
    if (!p) return;
    if (el.dataset?.pick) {
      p.picked = el.checked ? [...new Set([...p.picked, el.dataset.pick])] : p.picked.filter((id) => id !== el.dataset.pick);
      p.note = "";
      paintAddPanel();
    } else if (el.id === "drawer-all") {
      const team = teamById(p.teamId);
      const eligible = addCandidates(p, team).filter((u) => !u.teams.includes(team.name)).map((u) => u.id);
      p.picked = el.checked ? [...new Set([...p.picked, ...eligible])] : p.picked.filter((id) => !eligible.includes(id));
      paintAddPanel();
    } else if (["drawer-team", "drawer-group", "drawer-voucher"].includes(el.id)) {
      p[el.id.slice(7)] = el.value;
      paintAddPanel();
    }
  },
  true,
);
document.addEventListener("input", (event) => {
  const el = event.target;
  if (el.id === "teams-search") {
    state.teamsQuery = el.value;
    render();
  } else if (el.id === "team-member-search") {
    state.teamSearch = el.value;
    render();
  } else if (state.addPanel && el.id === "drawer-search") {
    state.addPanel.q = el.value;
    paintAddPanel();
  } else if (state.addPanel && el.id === "drawer-paste") {
    state.addPanel.pasted = el.value;
    paintAddPanel();
  }
});
document.addEventListener(
  "keydown",
  (event) => {
    if (state.addPanel) {
      if (event.key === "Escape" && !popover) {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeAddPanel();
        return;
      }
      trapDrawerFocus(event);
      return;
    }
    if (event.key === "Enter" && event.target.matches?.("#main .teams-table tr[data-team-row]")) openTeam(event.target.dataset.teamRow);
    if (event.key === "Escape" && state.teamMenu) {
      state.teamMenu = null;
      render();
    }
  },
  true,
);
document.addEventListener(
  "submit",
  (event) => {
    if (event.target.id !== "team-form") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const form = new FormData(event.target);
    const name = String(form.get("name") || "").trim();
    const description = String(form.get("description") || "").trim();
    const id = event.target.dataset.team;
    try {
      let newId = id;
      dispatch((st) => {
        if (id) st.updateTeam(id, { name, description });
        else newId = st.createTeam(name, description);
      });
      $("#modal").close();
      state.modal = null;
      if (id) {
        toast("Team updated");
      } else {
        toast(`Created ${name}`);
        openTeam(newId);
        openAddPanel(newId);
      }
    } catch (error) {
      $("#team-form-error").textContent = error.message;
      $("#team-form-name")?.focus();
    }
  },
  true,
);
