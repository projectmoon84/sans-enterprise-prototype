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
// Toolbar icons, drawn as in Figma (Teams toolbar, node 3137:11317). Search is the design's own
// outline icon; the rest are Material glyphs, filled with currentColor so they follow each control's state.
var TEAMS_ICONS = {
  search: '<svg class="teams-icon" width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M17.5 17.5L14.5834 14.5833M16.6667 9.58333C16.6667 13.4954 13.4954 16.6667 9.58333 16.6667C5.67132 16.6667 2.5 13.4954 2.5 9.58333C2.5 5.67132 5.67132 2.5 9.58333 2.5C13.4954 2.5 16.6667 5.67132 16.6667 9.58333Z" stroke="currentColor" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  expand: '<svg class="teams-icon" width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M12.4425 6.4425L9 9.8775L5.5575 6.4425L4.5 7.5L9 12L13.5 7.5L12.4425 6.4425Z" fill="currentColor"/></svg>',
  cards: '<svg class="teams-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 2V7.33333H7.33333V2H2ZM6 6H3.33333V3.33333H6V6ZM2 8.66667V14H7.33333V8.66667H2ZM6 12.6667H3.33333V10H6V12.6667ZM8.66667 2V7.33333H14V2H8.66667ZM12.6667 6H10V3.33333H12.6667V6ZM8.66667 8.66667V14H14V8.66667H8.66667ZM12.6667 12.6667H10V10H12.6667V12.6667Z" fill="currentColor"/></svg>',
  rows: '<svg class="teams-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 18H21V16H3V18ZM3 13H21V11H3V13ZM3 6V8H21V6H3Z" fill="currentColor"/></svg>',
};
function teamsToolbar(all) {
  const counts = Object.fromEntries(TEAMS_CHIPS.map(([key, , test]) => [key, all.filter(test).length]));
  return `<div class="teams-toolbar" data-spec="teams.toolbar" data-spec-label="Search, filters and sort"><div class="search">${TEAMS_ICONS.search}<input id="teams-search" placeholder="Search teams" aria-label="Search teams" value="${esc(state.teamsQuery)}" autocomplete="off"></div><div class="chip-bar" role="group" aria-label="Quick filters">${TEAMS_CHIPS.map(
    ([key, label]) => `<button type="button" class="filter-chip${state.teamsChip === key ? " active" : ""}" data-action="teams-chip" data-chip="${key}" aria-pressed="${state.teamsChip === key}">${esc(label)}<span class="chip-count">${counts[key]}</span></button>`,
  ).join("")}</div><label class="teams-sort" for="teams-sort"><span>Sort</span><span class="teams-select"><select id="teams-sort">${TEAMS_SORTS.map(([key, label]) => `<option value="${key}" ${state.teamsSort === key ? "selected" : ""}>${esc(label)}</option>`).join("")}</select>${TEAMS_ICONS.expand}</span></label><div class="view-toggle" role="group" aria-label="Layout" data-layout="${state.teamsLayout}" data-spec="teams.layout-toggle" data-spec-label="Cards and rows toggle"><span class="view-thumb" aria-hidden="true"></span>${["cards", "rows"]
    .map((layout) => `<button type="button" data-action="teams-layout" data-layout="${layout}" aria-pressed="${state.teamsLayout === layout}">${TEAMS_ICONS[layout]}${layout === "cards" ? "Cards" : "Rows"}</button>`)
    .join("")}</div></div>`;
}
// Switching between cards and rows: the highlight slides across, the list eases to its new height,
// and the new cards or rows arrive one after another. Reduced motion gets the switch on its own.
function switchTeamsLayout(layout) {
  const from = state.teamsLayout;
  const section = document.querySelector(".teams-card");
  const before = section ? section.getBoundingClientRect().height : 0;
  state.teamsLayout = layout;
  saveLayout(layout);
  render();
  if (from === layout || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  // The toggle is redrawn with the page, so its highlight is moved from the old side by hand.
  const thumb = document.querySelector(".view-thumb");
  if (thumb && thumb.animate) {
    const step = thumb.offsetWidth + 2;
    const at = (side) => `translateX(${side === "rows" ? step : 0}px)`;
    thumb.animate([{ transform: at(from) }, { transform: at(layout) }], { duration: 320, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
  }
  const next = document.querySelector(".teams-card");
  if (next && before) {
    const after = next.getBoundingClientRect().height;
    if (Math.abs(after - before) > 1) {
      next.style.height = `${before}px`;
      next.style.overflow = "hidden";
      void next.offsetWidth;
      next.style.transition = "height 360ms var(--ease-out-expo)";
      next.style.height = `${after}px`;
      const done = () => {
        next.style.removeProperty("height");
        next.style.removeProperty("overflow");
        next.style.removeProperty("transition");
      };
      next.addEventListener("transitionend", done, { once: true });
      setTimeout(done, 450);
    }
  }
  const items = document.querySelectorAll(layout === "cards" ? ".team-grid > *" : ".teams-card tbody > tr");
  items.forEach((el, i) => {
    el.classList.add(layout === "cards" ? "motion-in" : "motion-row");
    el.style.setProperty("--motion-delay", `${Math.min(i, 12) * (layout === "cards" ? 35 : 18)}ms`);
  });
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
// Who can see a team, as a short sentence: "Ada W", "Ada W and Marcus O", "Ada W, Marcus O and Tom H",
// then "Ada W, Marcus O and 2 more". Names, not initials: they answer "who?" at a glance.
function accessNames(people) {
  const names = people.map((p) => shortName(p.name));
  if (names.length <= 2) return names.join(" and ");
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}
// Team card (Figma: Team card, node 3222:24483): a monogram tile beside the name, the member count in
// cyan, and a tray saying who can see reports. A team with no members drops its white panel and offers
// Add Students in its place; a team nobody can see offers Give Portal Users Access in the tray.
function teamCardParts(t) {
  const canManage = actorCanBulk();
  const selected = state.teamSel.includes(t.id);
  const check = canManage ? `<input type="checkbox" class="row-check team-check" data-team-select="${esc(t.id)}" aria-label="Select ${esc(t.name)}" ${selected ? "checked" : ""}>` : "";
  const head = `<div class="tc-head"><h2 class="tc-name" id="team-card-${esc(t.id)}"><button type="button" class="team-card-link" data-action="team-open" data-team="${esc(t.id)}">${esc(t.name)}</button></h2>${check}${teamMenu(t, "card")}</div>`;
  const desc = `<p class="tc-desc${t.description ? "" : " is-missing"}">${esc(t.description || "No Description")}</p>`;
  const cls = `team-card tc${selected ? " is-selected" : ""}${state.highlightTeam === t.id ? " is-new" : ""}`;
  const open = (extra = "") => `<article class="${cls}${extra}" aria-labelledby="team-card-${esc(t.id)}" data-spec="teams.card" data-spec-label="Team card">`;
  return { canManage, head, desc, open };
}
// Icons from the Figma team card (group-outline-300, visibility-outline-300), filled with currentColor.
var TC_ICONS = {
  group: '<svg class="tcf-icon" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M2.596 16.97C2.596 16.5053 2.716 16.106 2.956 15.772C3.19667 15.4387 3.52 15.172 3.926 14.972C4.79333 14.5587 5.65467 14.2293 6.51 13.984C7.36467 13.738 8.39333 13.615 9.596 13.615C10.7987 13.615 11.8277 13.738 12.683 13.984C13.5383 14.23 14.3997 14.559 15.267 14.971C15.6723 15.171 15.9953 15.438 16.236 15.772C16.476 16.106 16.596 16.505 16.596 16.969V17.577C16.596 17.8317 16.4963 18.0683 16.297 18.287C16.0977 18.5057 15.851 18.615 15.557 18.615H3.636C3.34267 18.615 3.096 18.5153 2.896 18.316C2.69667 18.1167 2.597 17.8703 2.597 17.577L2.596 16.97ZM20.366 18.616H18.373C18.441 18.4567 18.4953 18.2887 18.536 18.112C18.576 17.936 18.596 17.7577 18.596 17.577V16.923C18.596 16.343 18.4787 15.796 18.244 15.282C18.01 14.7673 17.6773 14.326 17.246 13.958C17.7373 14.058 18.2107 14.1967 18.666 14.374C19.1213 14.5513 19.5713 14.751 20.016 14.973C20.4493 15.191 20.789 15.47 21.035 15.81C21.281 16.15 21.404 16.521 21.404 16.923V17.577C21.404 17.8703 21.304 18.117 21.104 18.317C20.9053 18.5157 20.6593 18.616 20.366 18.616ZM9.596 11.385C8.77133 11.385 8.06533 11.091 7.478 10.503C6.89067 9.915 6.59667 9.209 6.596 8.385C6.59533 7.561 6.88933 6.85433 7.478 6.265C8.06667 5.67567 8.77267 5.38233 9.596 5.385C10.4193 5.38767 11.1257 5.681 11.715 6.265C12.3043 6.849 12.598 7.55567 12.596 8.385C12.594 9.21433 12.3003 9.92033 11.715 10.503C11.1297 11.0857 10.4233 11.3797 9.596 11.385ZM16.866 8.385C16.866 9.20967 16.572 9.91567 15.984 10.503C15.396 11.0903 14.69 11.3843 13.866 11.385C13.8233 11.385 13.7693 11.38 13.704 11.37C13.6387 11.36 13.5847 11.3497 13.542 11.339C13.8813 10.9237 14.1417 10.463 14.323 9.957C14.505 9.45167 14.596 8.92667 14.596 8.382C14.596 7.83733 14.501 7.31733 14.311 6.822C14.1203 6.32533 13.864 5.86167 13.542 5.431C13.596 5.41167 13.65 5.399 13.704 5.393C13.758 5.387 13.812 5.384 13.866 5.384C14.6907 5.384 15.3967 5.678 15.984 6.266C16.5713 6.854 16.8653 7.56 16.866 8.384M3.596 17.616H15.596V16.969C15.596 16.7343 15.5373 16.5293 15.42 16.354C15.3027 16.1787 15.092 16.0107 14.788 15.85C14.042 15.4513 13.2553 15.146 12.428 14.934C11.6007 14.722 10.6567 14.616 9.596 14.616C8.53533 14.616 7.591 14.722 6.763 14.934C5.93633 15.146 5.14967 15.4513 4.403 15.85C4.09967 16.01 3.88933 16.178 3.772 16.354C3.65467 16.5293 3.596 16.7343 3.596 16.969V17.616ZM9.596 10.385C10.146 10.385 10.617 10.189 11.009 9.797C11.401 9.405 11.5967 8.934 11.596 8.384C11.5953 7.834 11.3997 7.36333 11.009 6.972C10.6183 6.58067 10.1473 6.38467 9.596 6.384C9.04467 6.38333 8.574 6.57933 8.184 6.972C7.794 7.36467 7.598 7.83533 7.596 8.384C7.594 8.93267 7.79 9.40367 8.184 9.797C8.578 10.1903 9.04867 10.386 9.596 10.384"/></svg>',
  visibility: '<svg class="tcf-icon" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.005 15.154C13.021 15.154 13.883 14.7983 14.591 14.087C15.299 13.3757 15.6533 12.512 15.654 11.496C15.6547 10.48 15.299 9.61767 14.587 8.909C13.875 8.20033 13.0113 7.846 11.996 7.846C10.9807 7.846 10.1183 8.20167 9.409 8.913C8.69967 9.62433 8.34533 10.4883 8.346 11.505C8.34667 12.5217 8.70233 13.3837 9.413 14.091C10.1237 14.7983 10.9877 15.1527 12.005 15.154ZM12 14.2C11.25 14.2 10.6127 13.9377 10.088 13.413C9.56333 12.8883 9.30067 12.2507 9.3 11.5C9.29933 10.7493 9.562 10.112 10.088 9.588C10.614 9.064 11.2513 8.80133 12 8.8C12.7487 8.79867 13.3863 9.06133 13.913 9.588C14.4397 10.1147 14.702 10.752 14.7 11.5C14.698 12.248 14.4357 12.8857 13.913 13.413C13.3903 13.9403 12.7527 14.2027 12 14.2ZM12 18C10.0227 18 8.20933 17.4767 6.56 16.43C4.91067 15.3833 3.57867 14.012 2.564 12.316C2.48067 12.178 2.42133 12.0423 2.386 11.909C2.35067 11.7757 2.333 11.639 2.333 11.499C2.333 11.359 2.35067 11.2223 2.386 11.089C2.42133 10.9557 2.48067 10.8207 2.564 10.684C3.57933 8.988 4.91133 7.61667 6.56 6.57C8.20867 5.52333 10.022 5 12 5C13.978 5 15.7913 5.52333 17.44 6.57C19.0887 7.61667 20.421 8.98833 21.437 10.685C21.5203 10.8217 21.5797 10.9567 21.615 11.09C21.6503 11.2233 21.6677 11.3603 21.667 11.501C21.6663 11.6417 21.649 11.7783 21.615 11.911C21.581 12.0437 21.5217 12.1787 21.437 12.316C20.4217 14.0127 19.0893 15.3843 17.44 16.431C15.7907 17.4777 13.9773 18.0007 12 18ZM12 17C13.8833 17 15.6127 16.5043 17.188 15.513C18.7633 14.5217 19.9673 13.184 20.8 11.5C19.9667 9.81667 18.7623 8.47933 17.187 7.488C15.6117 6.49667 13.8827 6.00067 12 6C10.1173 5.99933 8.38833 6.49533 6.813 7.488C5.23767 8.48067 4.03333 9.818 3.2 11.5C4.03333 13.1833 5.23767 14.521 6.813 15.513C8.38833 16.505 10.1173 17.0007 12 17Z"/></svg>',
};
// Two-letter monogram from the team name: "Application Security" → AS, "Forensics Lab" → FL.
function teamMonogram(name) {
  const words = String(name || "").split(/\s+/).filter((w) => /^[A-Za-z0-9]/.test(w));
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] || "?").slice(0, 2);
  return letters.toUpperCase();
}
function teamCard(t) {
  const { canManage, head, desc, open } = teamCardParts(t);
  const link = (action, label) =>
    canManage ? `<button type="button" class="tc-tray-action" data-action="${action}" data-team="${esc(t.id)}">${label}</button>` : `<span class="tcf-quiet">${label === "Add Students" ? "No Members Yet" : "Nobody Can See Reports"}</span>`;
  const top = `<div class="tcf-top"><span class="tcf-monogram" aria-hidden="true">${esc(teamMonogram(t.name))}</span><div class="tcf-title">${head}${desc}</div></div>`;
  const members = t.members.length
    ? `<p class="tcf-members">${TC_ICONS.group}<span class="tcf-count"><b>${t.members.length}</b> ${t.members.length === 1 ? "member" : "members"}</span></p>`
    : `<p class="tcf-members is-none">${TC_ICONS.group}${link("team-add-students", "Add Students")}</p>`;
  let tray;
  if (!t.access.length) tray = `<div class="tc-tray tcf-tray is-action">${TC_ICONS.visibility}${link("team-give-access-from-list", "Give Portal Users Access")}</div>`;
  else {
    const note = t.needsVoucher ? `${pluralize(t.needsVoucher, "needs", "need")} a voucher` : t.pending ? `${pluralize(t.pending, "invite")} pending` : "";
    tray = `<div class="tc-tray tcf-tray"><span class="tc-tray-text">${pluralize(t.access.length, "person", "people")} can see reports</span>${note ? `<span class="tc-note">${note}</span>` : ""}</div>`;
  }
  return `${open(t.members.length ? "" : " is-unstaffed")}<div class="tc-panel tcf-panel">${top}${members}</div>${tray}</article>`;
}

function teamRow(t) {
  const canManage = actorCanBulk();
  const selected = state.teamSel.includes(t.id);
  return `<tr data-team-row="${esc(t.id)}" tabindex="0" class="${selected ? "is-selected" : ""}">${canManage ? `<td class="selection-col"><input type="checkbox" class="row-check team-check" data-team-select="${esc(t.id)}" aria-label="Select ${esc(t.name)}" ${selected ? "checked" : ""}></td>` : ""}<td><div class="person-name">${esc(t.name)}</div><div class="secondary${t.description ? "" : " is-missing"}">${esc(t.description || "No Description")}</div></td><td class="num">${t.members.length || `<span class="team-flag muted">Empty</span>`}</td><td class="num">${t.groups.length}</td><td>${t.access.length ? `<span class="access-cell">${esc(accessNames(t.access))}</span>` : `<span class="team-flag">Not Visible to Anyone</span>`}</td><td class="secondary">${esc(teamDayLabel(t.last))}</td><td class="menu-cell">${teamMenu(t, "row")}</td></tr>`;
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
    : `<div class="team-members-toolbar teams-toolbar"><div class="search">${TEAMS_ICONS.search}<input id="team-member-search" placeholder="Search members" aria-label="Search members" value="${esc(state.teamSearch)}" autocomplete="off"></div><span class="teams-toolbar-spacer"></span>${canManage ? btn(icon("plus") + "Add Students", "team-add-students", "primary", `data-team="${esc(team.id)}" id="team-add-button"`) : ""}</div>`;
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
      return `<tr${rowHighlight(u)}><td><div class="access-person"><span class="face" aria-hidden="true">${esc(initial(u.name))}</span><div><div class="person-name">${esc(u.name)}</div><div class="secondary">${esc(u.email)}</div></div></div></td><td>${esc(u.role)}</td><td class="access-others">${others.length ? esc(others.length > 3 ? `${others.slice(0, 3).join(", ")} +${others.length - 3}` : others.join(", ")) : "This Team Only"}</td><td>${labelStatus(u.status)}</td><td class="menu-cell">${canManage ? `<button type="button" class="button small text" data-action="team-remove-access" data-id="${esc(u.id)}">Remove Access</button>` : ""}</td></tr>`;
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
// ---------- Team page ----------
// A header, three summary tiles that are also the tabs, and the selected tab's panel beneath.
var TEAM_TABS = ["members", "access", "history"];
function teamTile(key, team, s, events) {
  const selected = state.teamTab === key;
  const open = (label, short, glyph) => `<span class="team-tile-label">${icon(glyph)}<span class="long">${label}</span><span class="short" aria-hidden="true">${short}</span></span>`;
  let body;
  if (key === "members") {
    const active = s.members.filter((u) => u.status === "Active").length;
    const parts = [
      [active, "Active"],
      [s.pending, "Pending Invite"],
      [s.needsVoucher, "Needs Voucher"],
    ].filter(([n]) => n);
    body = `${open("Members", "Members", "users")}<span class="team-tile-figure"><b>${s.members.length}</b>${s.members.length === 1 ? "student" : "students"}</span><span class="team-tile-detail">${parts.length ? parts.map(([n, label]) => `${n} ${label}`).join(" · ") : "No Members Yet"}</span>`;
  } else if (key === "access") {
    body = `${open("Portal Users With Access", "Access", "groups")}<span class="team-tile-figure"><b>${s.access.length}</b>${s.access.length === 1 ? "person" : "people"}</span><span class="team-tile-detail">${
      s.access.length ? `<span class="team-tile-names">${esc(accessNames(s.access))}</span>` : `<span class="team-flag">Not Visible to Anyone</span>`
    }</span>`;
  } else {
    const latest = events[0];
    body = `${open("History", "History", "schedule")}<span class="team-tile-figure"><b>${events.length}</b>${events.length === 1 ? "change" : "changes"}</span><span class="team-tile-detail">${
      latest ? `Last change ${esc(teamDayLabel(latest.at))}${latest.actorName ? ` by ${esc(latest.actorName)}` : ""}` : `Created ${esc(teamDayLabel(team.createdAt))}`
    }</span>`;
  }
  return `<button type="button" role="tab" class="team-tile" id="team-tab-${key}" aria-selected="${selected}" aria-controls="team-panel" tabindex="${selected ? 0 : -1}" data-action="team-tab" data-tab="${key}">${body}<span class="team-tile-bar" aria-hidden="true"></span></button>`;
}
function teamPageView() {
  teamsState();
  const team = currentTeam();
  if (!team) {
    state.teamId = null;
    return teamsListView();
  }
  const s = teamSummary(team);
  const events = teamEvents(team);
  const canManage = actorCanBulk();
  const panel = state.teamTab === "access" ? accessPanel(team) : state.teamTab === "history" ? historyPanel(team) : membersPanel(team);
  const description = team.description
    ? `<p class="team-desc">${esc(team.description)}</p>`
    : `<p class="team-desc is-missing">${canManage ? `<button type="button" class="button-link" data-action="team-edit" data-team="${esc(team.id)}">Add a Description</button> so people can tell similar teams apart.` : "No Description"}</p>`;
  return `<button class="back" data-action="teams-back">${icon("back")}Teams</button><header class="team-hero" data-spec="team.header" data-spec-label="Team header"><div class="team-hero-text"><h1 class="team-title">${esc(team.name)}</h1>${description}<p class="team-meta">Created by ${esc(personName(team.createdBy))} on ${esc(new Date(team.createdAt).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }))}</p></div>${canManage ? teamMenu(team, "page") : ""}</header><div class="team-tiles" role="tablist" aria-label="${esc(team.name)}" data-spec="team.tabs" data-spec-label="Team summary tabs">${TEAM_TABS.map((key) => teamTile(key, team, s, events)).join("")}</div><div class="team-panel-wrap" role="tabpanel" id="team-panel" aria-labelledby="team-tab-${state.teamTab}">${panel}</div>`;
}

// Switching tabs: the cyan bar drops out of the old tile and rises into the new one, the panel eases to its new height, and the new
// panel slides in from the side you moved towards, its rows following one after another.
function switchTeamTab(tab) {
  const fromIndex = TEAM_TABS.indexOf(state.teamTab);
  const toIndex = TEAM_TABS.indexOf(tab);
  const wrap = document.getElementById("team-panel");
  const before = wrap ? wrap.getBoundingClientRect().height : 0;
  state.teamTab = tab;
  state.selected = [];
  state.rowMenu = null;
  render();
  document.getElementById(`team-tab-${tab}`)?.focus({ preventScroll: true });
  if (fromIndex === toIndex || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  // Each tile keeps its own bar, clipped inside it: the old one drops out of sight, then the new one rises.
  const oldBar = document.querySelector(`#team-tab-${TEAM_TABS[fromIndex]} .team-tile-bar`);
  const newBar = document.querySelector(`#team-tab-${tab} .team-tile-bar`);
  if (oldBar && newBar && newBar.animate) {
    oldBar.animate([{ transform: "translateY(0)" }, { transform: "translateY(100%)" }], { duration: 200, easing: "cubic-bezier(0.55, 0, 1, 0.45)" });
    newBar.animate([{ transform: "translateY(100%)" }, { transform: "translateY(0)" }], { duration: 360, delay: 140, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "backwards" });
  }
  const next = document.getElementById("team-panel");
  if (!next) return;
  const after = next.getBoundingClientRect().height;
  if (before && Math.abs(after - before) > 1) {
    next.animate([{ height: `${before}px` }, { height: `${after}px` }], { duration: 380, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
  }
  const panel = next.firstElementChild;
  if (panel) {
    panel.style.setProperty("--team-dx", `${toIndex > fromIndex ? 24 : -24}px`);
    panel.classList.add("team-panel-in");
    panel.addEventListener("animationend", (e) => e.target === panel && panel.classList.remove("team-panel-in"));
  }
  next.querySelectorAll("tbody > tr, .activity-day").forEach((el, i) => {
    el.classList.add(el.matches("tr") ? "motion-row" : "motion-in");
    el.style.setProperty("--motion-delay", `${80 + Math.min(i, 12) * 22}ms`);
  });
}

// Opening a team, or going back: the team's name travels between its card (or row) and the page title,
// while the rest of the page changes around it.
function teamNameEl(id) {
  return document.getElementById(`team-card-${id}`) || document.querySelector(`[data-team-row="${CSS.escape(id)}"] .person-name`);
}
function flyTitle(fromRect, fromSize, target) {
  if (!fromRect || !target || !target.animate) return;
  const to = target.getBoundingClientRect();
  const size = parseFloat(getComputedStyle(target).fontSize) || 1;
  const scale = fromSize / size;
  target.style.transformOrigin = "0 0";
  target.animate(
    [{ transform: `translate(${fromRect.left - to.left}px, ${fromRect.top - to.top}px) scale(${scale})` }, { transform: "none" }],
    { duration: 560, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
  );
}
function changeTeamPage(change, fromEl, findTarget) {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fromRect = fromEl && !still ? fromEl.getBoundingClientRect() : null;
  const fromSize = fromEl ? parseFloat(getComputedStyle(fromEl).fontSize) : 0;
  const sameView = state.view === "teams";
  if (sameView && !still) ghostOutgoingPage();
  change();
  if (still) return;
  const main = document.getElementById("main");
  if (sameView && main) staggerIn(main, PAGE_DELAY);
  const target = findTarget();
  if (!fromRect || !target) return;
  // The travelling title must be visible from the start, so its block doesn't fade in.
  const block = target.closest(".team-hero, .team-card, tr");
  if (block) {
    // Everything around the title waits, then settles in once the title has nearly landed.
    block.classList.remove("motion-in", "motion-row");
    let delay = 240;
    for (let el = target; el && el !== block; el = el.parentElement) {
      [...el.parentElement.children].forEach((sib) => {
        if (sib === el) return;
        sib.classList.add("motion-in");
        sib.style.setProperty("--motion-delay", `${delay}ms`);
        delay += 50;
      });
    }
  }
  flyTitle(fromRect, fromSize, target);
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
  changeTeamPage(() => navigate("teams"), teamNameEl(id), () => document.querySelector(".team-title"));
}
function leaveTeam() {
  const id = state.teamId;
  state.teamId = null;
  state.teamMenu = null;
  changeTeamPage(() => navigate("teams"), document.querySelector(".team-title"), () => teamNameEl(id));
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

// ---------- Add Students to a team: one dialog, three tabs ----------
// Choose Existing Students (pick from the directory), Invite New Students (the same entry form as
// Students → Add Students → Individuals) and Upload a CSV (the same import). All three live in the app's
// one dialog under one title, so switching tabs swaps the content without replaying the entrance.
// Invite and CSV are the existing flows with this team filled in; once a student is saved or a file is
// chosen the tabs step aside, because the person has committed to that route.
var TEAM_ADD_TABS = [
  ["choose", "Choose Existing Students"],
  ["invite", "Invite New Students"],
  ["csv", "Upload a CSV"],
];
function addPanelState() {
  return state.addPanel;
}
function teamAddTeam() {
  return state.addPanel && teamById(state.addPanel.teamId);
}
// Which tab the dialog is showing, or null once the person is past the first step of a route.
function teamAddTab() {
  if (!teamAddTeam()) return null;
  if (state.modal === "team-add") return "choose";
  if ((state.modal === "student-detail" || state.modal === "student-new" || state.modal === "student-saved") && !state.drafts.length) return "invite";
  if ((state.modal === "upload" || state.modal === "uploading") && !state.upload?.fileName) return "csv";
  return null;
}
function teamAddTabs(active) {
  return `<div class="drawer-tabs team-add-tabs" role="tablist" aria-label="How to Add Students">${TEAM_ADD_TABS.map(
    ([key, label]) => `<button type="button" role="tab" id="team-add-tab-${key}" aria-selected="${active === key}" tabindex="${active === key ? 0 : -1}" data-action="team-add-tab" data-tab="${key}">${label}</button>`,
  ).join("")}</div>`;
}
// Every dialog step inside this flow gets the team's title; the entry steps also get the tabs.
const teamsBaseOpenModal = openModal;
openModal = function (title, description, body, footer = "", stepsHtml = "", compact = false) {
  const team = teamAddTeam();
  const inFlow = team && /^(team-add|student-|upload|uploading|discard)/.test(state.modal || "");
  const tab = teamAddTab();
  if (inFlow && state.modal !== "discard") {
    title = `Add Students to ${esc(team.name)}`;
    if (tab) {
      description = "Choose students already in your organization, invite new ones, or upload a CSV.";
      stepsHtml = teamAddTabs(tab) + stepsHtml;
      compact = false;
    }
  }
  const result = teamsBaseOpenModal(title, description, body, footer, stepsHtml, compact);
  $("#modal").classList.toggle("team-add-modal", Boolean(inFlow && state.modal !== "discard"));
  if (inFlow && tab) {
    $("#modal").dataset.spec = "teams.add-panel"; // name kept from the old side panel: Hobnob notes are attached to it
    $("#modal").dataset.specLabel = "Add students dialog";
  }
  return result;
};
// New students invited from a team start in that team, and the next one does too.
const teamsBaseStudentForm = studentForm;
studentForm = function (...args) {
  const team = teamAddTeam();
  if (team && !(state.studentEntry || {}).team && args[0] == null) state.studentEntry = { ...(state.studentEntry || {}), team: team.name };
  return teamsBaseStudentForm(...args);
};
// A CSV chosen from a team fills in that team for any row that doesn't name one.
const teamsBaseStageCSV = stageCSV;
stageCSV = function (...args) {
  const team = teamAddTeam();
  const result = teamsBaseStageCSV(...args);
  if (team && state.upload?.rows) state.upload.rows.forEach((row) => { if (!row.team) row.team = team.name; });
  return result;
};
$("#modal").addEventListener("close", () => {
  if (!state.addPanel) return;
  const back = state.addPanel.returnFocus;
  state.addPanel = null;
  $("#modal").classList.remove("team-add-modal");
  if (back) setTimeout(() => document.getElementById(back)?.focus(), 0);
});
function openAddPanel(teamId) {
  const team = teamById(teamId);
  if (!team) return;
  state.addPanel = { teamId, q: "", team: "any", group: "any", voucher: "any", picked: [], returnFocus: document.activeElement?.id || "team-add-button" };
  showTeamAddTab("choose");
}
function showTeamAddTab(tab) {
  const team = teamAddTeam();
  if (!team) return;
  if (tab === "choose") {
    state.modal = "team-add";
    paintAddPanel(true);
    setTimeout(() => $("#drawer-search")?.focus(), 0);
  } else if (tab === "invite") {
    state.studentEntry = { team: team.name };
    state.entryOpen = true;
    state.reuseAssignments = false;
    state.modal = "student-new";
    studentForm();
  } else {
    state.upload = null;
    uploadForm();
  }
}
function closeAddPanel() {
  if ($("#modal").open) closeModal();
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
function selectFilter(id, label, value, options) {
  return `<label class="drawer-filter" for="${id}"><span>${label}</span><select id="${id}">${options.map(([v, text]) => `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(text)}</option>`).join("")}</select></label>`;
}
// Choose Existing Students. The first paint opens the tab; later paints (typing, ticking, filtering)
// redraw only the body and footer, keeping focus, caret and list scroll where they were.
function paintAddPanel(open = false) {
  const p = addPanelState();
  const team = teamAddTeam();
  if (!p || !team || state.modal !== "team-add") return;
  const modal = $("#modal");
  const focus = document.activeElement?.id;
  const caret = document.activeElement?.selectionStart;
  const listScroll = modal.querySelector(".drawer-list")?.scrollTop || 0;
  const picked = p.picked.map((id) => db.users.find((u) => u.id === id)).filter(Boolean);
  const moving = picked.filter((u) => u.teams.length).length;
  const fresh = picked.length - moving;
  const list = addCandidates(p, team);
  const eligible = list.filter((u) => !u.teams.includes(team.name));
  const allOn = eligible.length > 0 && eligible.every((u) => p.picked.includes(u.id));
  const body = `<div class="drawer-section"><div class="search drawer-search">${icon("search")}<input id="drawer-search" placeholder="Search name or email" aria-label="Search students" value="${esc(p.q)}" autocomplete="off"></div><div class="drawer-filters">${selectFilter("drawer-team", "Team", p.team, [["any", "Any Team"], ["none", "No Team"], ...db.teams.filter((n) => n !== team.name).map((n) => [n, n])])}${selectFilter("drawer-group", "Admin Group", p.group, [["any", "Any"], ["none", "No Admin Group"], ...db.groups.map((n) => [n, n])])}${selectFilter("drawer-voucher", "Voucher", p.voucher, [["any", "Any"], ["none", "No Voucher"], ...db.vouchers.map((n) => [n, n])])}</div><label class="drawer-select-all"><input type="checkbox" class="row-check" id="drawer-all" ${allOn ? "checked" : ""} ${eligible.length ? "" : "disabled"}><span>Select all ${eligible.length} matching</span></label><div class="drawer-list" role="group" aria-label="Students">${
    list.length
      ? list
          .slice(0, 300)
          .map((u) => {
            const inTeam = u.teams.includes(team.name);
            const where = inTeam ? `Already in ${team.name}` : u.teams.length ? `In ${u.teams[0]}` : "No Team";
            return `<label class="drawer-person${inTeam ? " is-disabled" : ""}${p.picked.includes(u.id) ? " is-picked" : ""}"><input type="checkbox" class="row-check" data-pick="${esc(u.id)}" ${p.picked.includes(u.id) ? "checked" : ""} ${inTeam ? "disabled" : ""}><span class="face">${esc(initial(u.name || u.email))}</span><span class="drawer-person-text"><strong>${esc(u.name || u.email)}</strong><span>${esc(where)}${u.groups.length ? ` · ${esc(u.groups[0])}` : ""}</span></span>${!inTeam && u.teams.length ? `<span class="move-tag">Moves</span>` : ""}</label>`;
          })
          .join("")
      : `<p class="drawer-empty">No students match. Try another search or filter, or invite them as new students.</p>`
  }</div></div>`;
  const summary = picked.length
    ? `<strong>${pluralize(picked.length, "student")} selected</strong><span>${[moving ? `${moving} will move from ${moving === 1 ? "another team" : "other teams"}` : "", fresh ? `${fresh} ${fresh === 1 ? "has" : "have"} no team yet` : ""].filter(Boolean).join(" · ")}</span>`
    : `<strong>No one selected yet</strong><span>Pick the students to add to this team</span>`;
  const footer = `<div class="drawer-summary" role="status">${summary}</div><div class="actions">${btn("Cancel", "close-modal")}${btn(picked.length ? `Add ${pluralize(picked.length, "student")}` : "Add Students", "drawer-add", "primary", picked.length ? "" : "disabled")}</div>`;
  if (open || !modal.open || !modal.querySelector(".drawer-section")) {
    openModal("", "", body, footer);
    modal.querySelector(".modal-body")?.classList.add("drawer-body");
    modal.querySelector(".modal-footer")?.classList.add("drawer-foot");
    return;
  }
  modal.querySelector(".modal-body").innerHTML = body;
  modal.querySelector(".modal-footer").innerHTML = footer;
  const listEl = modal.querySelector(".drawer-list");
  if (listEl) listEl.scrollTop = listScroll;
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
        switchTeamsLayout(target.dataset.layout);
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
        switchTeamTab(target.dataset.tab);
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
      // ----- Add students dialog -----
      case "team-add-tab":
        stop();
        if (target.getAttribute("aria-selected") !== "true") showTeamAddTab(target.dataset.tab);
        setTimeout(() => document.getElementById(`team-add-tab-${target.dataset.tab}`)?.focus(), 30);
        return;
      // Invitations sent from a team's dialog come back to that team, not the Students page.
      case "finish-students":
        if (teamAddTeam()) {
          stop();
          const id = state.addPanel.teamId;
          state.addPanel.returnFocus = "";
          $("#modal").close();
          state.modal = null;
          openTeam(id);
          state.teamTab = "members";
          render();
        }
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
  }
});
document.addEventListener(
  "keydown",
  (event) => {
    // Arrow keys move between the Add Students tabs.
    if (event.target.matches?.(".team-add-tabs [role='tab']") && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const keys = TEAM_ADD_TABS.map(([k]) => k);
      const i = keys.indexOf(event.target.dataset.tab);
      const next = event.key === "Home" ? 0 : event.key === "End" ? keys.length - 1 : (i + (event.key === "ArrowRight" ? 1 : -1) + keys.length) % keys.length;
      showTeamAddTab(keys[next]);
      setTimeout(() => document.getElementById(`team-add-tab-${keys[next]}`)?.focus(), 30);
      return;
    }
    if (event.key === "Enter" && event.target.matches?.("#main .teams-table tr[data-team-row]")) openTeam(event.target.dataset.teamRow);
    // The summary tiles are a tab list: arrow keys, Home and End move between them.
    if (event.target.matches?.(".team-tile") && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const i = TEAM_TABS.indexOf(state.teamTab);
      const next = event.key === "Home" ? 0 : event.key === "End" ? TEAM_TABS.length - 1 : (i + (event.key === "ArrowRight" ? 1 : -1) + TEAM_TABS.length) % TEAM_TABS.length;
      switchTeamTab(TEAM_TABS[next]);
    }
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
