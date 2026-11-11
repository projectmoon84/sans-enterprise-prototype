// Shared pieces for working on many rows at once: toast with Undo, cell pop-over,
// preview dialog, bulk action bar and quick-filter chips. The Students and Portal
// users tables use them here; import-review.js adds the CSV review on top.
// Loads after the table and profile layers, so it can override their toolbar.

var BULK_UNDO_MS = 10000; // open question 4: Undo lasts as long as the toast, about 10 seconds

// ---------- Toast with actions ----------
function hideActionToast() {
  clearTimeout(toastTimer);
  const el = $("#toast");
  el.classList.remove("visible", "has-actions");
  state.toastActions = null;
}
function toastWith(message, actions = [], ms = BULK_UNDO_MS) {
  const el = $("#toast");
  clearTimeout(toastTimer);
  state.toastActions = actions;
  el.innerHTML = `<span>${esc(message)}</span>${actions
    .map((a, i) => `<button type="button" class="toast-action" data-toast-action="${i}">${esc(a.label)}</button>`)
    .join("")}`;
  el.classList.toggle("has-actions", actions.length > 0);
  el.classList.add("visible");
  toastTimer = setTimeout(hideActionToast, ms);
}
const bulkBaseToast = toast;
toast = function (message) {
  $("#toast").classList.remove("has-actions");
  state.toastActions = null;
  bulkBaseToast(message);
};
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-toast-action]");
  if (!button) return;
  const action = state.toastActions?.[Number(button.dataset.toastAction)];
  hideActionToast();
  action?.run();
});

// ---------- Cell pop-over ----------
// spec: { title, items: [{ value, label, hint?, disabled?, selected? }], note?, placeholder?,
//         custom?: { label }, footer?: [{ label, run }], multi?, modes?, applyLabel?,
//         returnSelector?, onPick(value | values, mode) }
var popover = null;
function popoverMatches(spec, text) {
  const needle = text.trim().toLowerCase();
  return spec.items.filter((item) => !needle || item.label.toLowerCase().includes(needle));
}
function paintPopover() {
  const { root, spec } = popover;
  const search = root.querySelector(".popover-search input");
  const items = popoverMatches(spec, search.value);
  const custom =
    spec.custom && search.value.trim() && !spec.items.some((i) => i.label.toLowerCase() === search.value.trim().toLowerCase())
      ? [{ value: search.value.trim(), label: `${spec.custom.label} “${search.value.trim()}”`, custom: true }]
      : [];
  const options = [...items, ...custom];
  popover.options = options;
  popover.active = Math.min(popover.active, options.length - 1);
  root.querySelector(".popover-list").innerHTML = options.length
    ? options
        .map((item, index) =>
          spec.multi
            ? `<label class="popover-option check${item.disabled ? " disabled" : ""}" role="option" id="popover-option-${index}"><input type="checkbox" value="${esc(item.value)}" ${popover.picked.has(item.value) ? "checked" : ""} ${item.disabled ? "disabled" : ""}><span>${esc(item.label)}${item.hint ? `<small>${esc(item.hint)}</small>` : ""}</span></label>`
            : `<button type="button" class="popover-option${index === popover.active ? " active" : ""}${item.selected ? " selected" : ""}" role="option" id="popover-option-${index}" tabindex="-1" data-index="${index}" aria-selected="${Boolean(item.selected)}" ${item.disabled ? "disabled" : ""}>${esc(item.label)}${item.hint ? `<small>${esc(item.hint)}</small>` : ""}</button>`,
        )
        .join("")
    : '<p class="popover-empty">No Matches Found</p>';
  search.setAttribute("aria-activedescendant", popover.active >= 0 ? `popover-option-${popover.active}` : "");
}
function placePopover() {
  if (!popover) return;
  const anchor = popover.anchor;
  if (!anchor?.isConnected && !popover.rect) return closePopover();
  const rect = anchor?.isConnected ? anchor.getBoundingClientRect() : popover.rect;
  popover.rect = rect;
  const { root } = popover;
  const width = root.offsetWidth;
  const height = root.offsetHeight;
  let left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
  let top = rect.bottom + 6;
  if (top + height > window.innerHeight - 8 && rect.top - height - 6 > 8) top = rect.top - height - 6;
  root.style.left = `${left}px`;
  root.style.top = `${Math.max(8, top)}px`;
}
function closePopover(restore = true) {
  if (!popover) return;
  const { root, anchor, returnSelector } = popover;
  root.remove();
  popover = null;
  if (!restore) return;
  const back = (returnSelector && document.querySelector(returnSelector)) || (anchor?.isConnected ? anchor : null);
  back?.focus();
}
function openPopover(anchor, spec) {
  closePopover(false);
  const root = document.createElement("div");
  root.className = "cell-popover";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", spec.title);
  const modes = spec.modes
    ? `<fieldset class="popover-modes"><legend class="sr-only">How to Apply</legend>${spec.modes.map((mode, i) => `<label><input type="radio" name="popover-mode" value="${esc(mode.value)}" ${i === 0 ? "checked" : ""}>${esc(mode.label)}</label>`).join("")}</fieldset>`
    : "";
  root.innerHTML = `<p class="popover-title">${esc(spec.title)}</p>${modes}<div class="popover-search"><input type="text" role="combobox" aria-expanded="true" aria-controls="popover-list" aria-label="${esc(spec.placeholder || "Search")}" placeholder="${esc(spec.placeholder || "Search")}" autocomplete="off"></div>${spec.note ? `<p class="popover-note">${esc(spec.note)}</p>` : ""}<div class="popover-list" id="popover-list" role="listbox" ${spec.multi ? 'aria-multiselectable="true"' : ""} aria-label="${esc(spec.title)}"></div>${spec.multi ? `<div class="popover-actions"><button type="button" class="button small text" data-popover="cancel">Cancel</button><button type="button" class="button small primary" data-popover="apply">${esc(spec.applyLabel || "Apply")}</button></div>` : ""}${spec.footer?.length ? `<div class="popover-footer">${spec.footer.map((f, i) => `<button type="button" class="button-link" data-popover-footer="${i}">${esc(f.label)}</button>`).join("")}</div>` : ""}`;
  document.body.append(root);
  popover = { root, anchor, spec, active: spec.multi ? -1 : Math.max(0, spec.items.findIndex((i) => i.selected)), options: [], picked: new Set(spec.items.filter((i) => i.selected).map((i) => i.value)), returnSelector: spec.returnSelector };
  paintPopover();
  placePopover();
  root.querySelector("input[role=combobox]").focus();
}
function pickPopover(index) {
  const item = popover?.options[index];
  if (!item || item.disabled) return;
  const { spec } = popover;
  closePopover(false);
  spec.onPick(item.value);
}
function applyPopover() {
  const { spec, picked, root } = popover;
  const mode = root.querySelector("input[name=popover-mode]:checked")?.value;
  const values = [...picked];
  closePopover();
  if (values.length) spec.onPick(values, mode);
}
document.addEventListener("keydown", (event) => {
  if (!popover) return;
  const input = popover.root.querySelector("input[role=combobox]");
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    closePopover();
  } else if (event.target === input && !popover.spec.multi) {
    const last = popover.options.length - 1;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      popover.active = event.key === "ArrowDown" ? Math.min(last, popover.active + 1) : Math.max(0, popover.active - 1);
      paintPopover();
      popover.root.querySelector(".popover-option.active")?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter") {
      event.preventDefault();
      pickPopover(popover.active >= 0 ? popover.active : 0);
    }
  }
}, true);
document.addEventListener("input", (event) => {
  if (popover && event.target.closest(".popover-search")) {
    popover.active = popover.spec.multi ? -1 : 0;
    paintPopover();
  }
});
document.addEventListener("change", (event) => {
  if (!popover || !event.target.closest(".popover-list")) return;
  const box = event.target;
  if (box.checked) popover.picked.add(box.value);
  else popover.picked.delete(box.value);
});
document.addEventListener("mousedown", (event) => {
  if (popover && !event.target.closest(".cell-popover") && event.target !== popover.anchor && !popover.anchor?.contains(event.target)) closePopover(false);
});
document.addEventListener("click", (event) => {
  if (!popover) return;
  const option = event.target.closest(".popover-option[data-index]");
  if (option) return pickPopover(Number(option.dataset.index));
  const action = event.target.closest("[data-popover]")?.dataset.popover;
  if (action === "apply") applyPopover();
  if (action === "cancel") closePopover();
  const footer = event.target.closest("[data-popover-footer]");
  if (footer) {
    const run = popover.spec.footer[Number(footer.dataset.popoverFooter)].run;
    closePopover(false);
    run();
  }
});
window.addEventListener("resize", placePopover);
window.addEventListener("scroll", placePopover, true);

// ---------- Contexts: which rows, which actions ----------
var SELECT_ALL_LABEL = "Select all rows";
function chipKey() {
  return (state.chips ||= {});
}
function rowNeedsVoucher(u) {
  return u.status === "Needs voucher" || (state.view === "import" && !u.voucher);
}
const STUDENT_CHIPS = [
  ["all", "All", () => true],
  ["needsVoucher", "Needs voucher", (u) => u.status === "Needs voucher"],
  ["pending", "Pending invite", (u) => u.status === "Pending invite"],
  ["suspended", "Suspended", (u) => u.status === "Suspended"],
  ["noGroup", "No Admin Group", (u) => !u.groups.length],
  ["noTeam", "No Team", (u) => !u.teams.length],
];
const PORTAL_CHIPS = [
  ["all", "All", () => true],
  ["pending", "Pending invite", (u) => u.status === "Pending invite"],
  ["suspended", "Suspended", (u) => u.status === "Suspended"],
  ["admin", "Admin", (u) => u.role === "Admin" || u.role === "SSO Admin"],
  ["limited", "Limited Admin", (u) => u.role === "Limited Admin"],
  ["viewer", "Viewer", (u) => u.role === "Viewer"],
];
function chipsFor(view) {
  return view === "students" ? STUDENT_CHIPS : view === "portal" ? PORTAL_CHIPS : null;
}
function activeChip(view = state.view) {
  return chipKey()[view] || "all";
}
const bulkBaseMatches = matchesFilters;
matchesFilters = function (u, imported = false) {
  if (!bulkBaseMatches(u, imported)) return false;
  if (imported) return importChipMatches(u);
  const chips = chipsFor(state.view);
  if (!chips) return true;
  const chip = chips.find((c) => c[0] === activeChip(state.view));
  return !chip || chip[2](u);
};
function chipsHtml(chips, active, label) {
  return `<div class="chip-bar" role="group" aria-label="${esc(label)}" data-spec="${state.view === "import" ? "csv.review.chips" : "people.chips"}" data-spec-label="Quick filter chips">${chips
    .map(([key, text, count]) => `<button type="button" class="filter-chip${key === active ? " active" : ""}" data-action="chip" data-chip="${key}" aria-pressed="${key === active}">${esc(shown(text))}<span class="chip-count">${count}</span></button>`)
    .join("")}</div>`;
}
function tableChipsHtml() {
  const chips = chipsFor(state.view);
  const all = db.users.filter((u) => u.type === (state.view === "students" ? "student" : "portal"));
  return chipsHtml(
    chips.map(([key, text, test]) => [key, text, all.filter(test).length]),
    activeChip(state.view),
    "Quick filters",
  );
}

function pluralize(count, one, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

// A context says which rows exist, what the signed-in person can do to them, and
// how to run an action. Students and Portal users run through the store.
function storeRun(kind, ids, params, { dryRun = false } = {}) {
  if (dryRun) return store.bulk(kind, ids, params, { dryRun: true });
  let result;
  dispatch((st) => {
    result = st.bulk(kind, ids, params);
  });
  return result;
}
// Viewers cannot change anyone. The store also checks each row, so Limited Admins
// only change students inside their scope.
function actorCanBulk() {
  const snapshot = store.snapshot();
  const role = snapshot.people.find((p) => p.id === snapshot.session.actorId)?.portal?.role;
  return ["Admin", "SSO Admin", "Limited Admin"].includes(role);
}
function bulkContext() {
  if (state.view === "import") return importContext();
  if (state.view !== "students" && state.view !== "portal") return null;
  const students = state.view === "students";
  const rows = db.users.filter((u) => u.type === (students ? "student" : "portal"));
  return {
    key: state.view,
    noun: students ? ["student", "students"] : ["person", "people"],
    rows,
    visible: rows.filter((u) => matchesFilters(u)),
    run: storeRun,
    canEdit: actorCanBulk(),
    rowFor: (id) => rows.find((u) => u.id === id),
  };
}

// ---------- Bulk bar ----------
function moreMenuItems(ctx) {
  if (ctx.key === "import")
    return [["team-clear", "Remove From Team"], ["export", "Export Selected as CSV"]];
  if (ctx.key === "students")
    return [["team-clear", "Remove From Team"], ["resend", "Resend Invitation"], ["suspend", "Suspend"], ["reactivate", "Reactivate"], ["export", "Export Selected"], ["removeDialog", "Remove…", "danger"]];
  return [["resend", "Resend Invitation"], ["suspend", "Suspend"], ["reactivate", "Reactivate"], ["export", "Export Selected"], ["removeDialog", "Remove…", "danger"]];
}
function mainActions(ctx) {
  if (ctx.key === "import")
    return [["voucher", "Assign Voucher"], ["adminGroup", "Assign Admin Group"], ["team", "Add to Team"], ["workRole", "Set Work Role"], ["removeFromImport", "Remove From Import"]];
  if (ctx.key === "students")
    return [["voucher", "Assign Voucher"], ["adminGroup", "Assign Admin Group"], ["team", "Add to Team"]];
  return [["access-voucher", "Voucher Access"], ["access-adminGroup", "Admin Group Access"], ["access-team", "Team Access"], ["role", "Change Role"]];
}
function bulkBarHtml(ctx) {
  const count = state.selected.length;
  const allVisibleSelected = ctx.visible.length > 0 && ctx.visible.every((u) => state.selected.includes(u.id));
  const offerAll = allVisibleSelected && ctx.visible.length < ctx.rows.length && state.selected.length < ctx.rows.length;
  const disabled = ctx.canEdit === false ? "disabled" : "";
  const visibleIds = new Set(ctx.visible.map((u) => u.id));
  const hidden = state.selected.filter((id) => !visibleIds.has(id)).length;
  return `<div class="bulk-bar" role="region" aria-label="Bulk Actions" data-spec="bulk-bar" data-spec-label="Bulk action bar"><span class="bulk-count" role="status">${count} selected${hidden ? ` · ${hidden} hidden by filters` : ""}</span><div class="bulk-actions">${mainActions(ctx)
    .map(([kind, label]) => `<button type="button" class="button small" data-action="bulk-open" data-kind="${kind}" ${disabled}>${esc(label)}</button>`)
    .join("")}<div class="menu-anchor"><button type="button" class="button small" data-action="bulk-more" aria-haspopup="menu" aria-expanded="${Boolean(state.bulkMore)}">More${icon("chevron")}</button>${state.bulkMore ? `<div class="dropdown-menu bulk-more-menu" role="menu">${moreMenuItems(ctx).map(([kind, label, tone]) => `<button type="button" role="menuitem" data-action="bulk-more-item" data-kind="${kind}" class="${tone || ""}" ${kind !== "export" ? disabled : ""}>${esc(label)}</button>`).join("")}</div>` : ""}</div></div>${offerAll ? `<button type="button" class="button-link" data-action="bulk-select-all">Select all ${ctx.rows.length} ${ctx.key === "import" ? "rows" : ctx.noun[1]}</button>` : ""}<button type="button" class="bulk-clear" data-action="bulk-clear" aria-label="Clear Selection">Clear${icon("close")}</button></div>`;
}
const bulkBaseToolbar = toolbar;
toolbar = function (imported = false) {
  const ctx = bulkContext();
  if (ctx && state.selected.length) return bulkBarHtml(ctx);
  return bulkBaseToolbar(imported);
};

// ---------- Choosing a value, previewing, applying, reporting ----------
// A Limited Admin can only choose vouchers they manage.
function voucherChoices() {
  const snapshot = store.snapshot();
  const actor = snapshot.people.find((p) => p.id === snapshot.session.actorId);
  if (actor?.portal?.role !== "Limited Admin") return VOUCHERS;
  return snapshot.vouchers.filter((v) => actor.portal.voucherIds.includes(v.id)).map((v) => v.name);
}
function intersect(lists) {
  return lists.length ? lists.reduce((a, b) => a.filter((x) => b.includes(x))) : [];
}
function selectedRows(ctx) {
  return state.selected.map((id) => ctx.rowFor(id)).filter(Boolean);
}
function groupChoices(ctx, rows) {
  const vouchers = rows.map((r) => (r.vouchers ? r.vouchers[0] : r.voucher)).filter(Boolean);
  const withVoucher = rows.filter((r) => (r.vouchers ? r.vouchers[0] : r.voucher));
  const distinct = [...new Set(vouchers)];
  const items = intersect(distinct.map((v) => groupsForVouchers([v], db.groups)));
  const missing = rows.length - withVoucher.length;
  const notes = [];
  if (distinct.length > 1) notes.push(`Showing admin groups shared by all ${distinct.length} vouchers in your selection.`);
  if (missing) notes.push(`${pluralize(missing, "selected student needs", "selected students need")} a voucher before an admin group can be assigned.`);
  return { items, note: notes.join(" ") };
}
function openBulkPicker(ctx, kind, anchor) {
  const rows = selectedRows(ctx);
  const returnSelector = `[data-action="bulk-open"][data-kind="${kind}"]`;
  const single = (title, items, extra = {}) =>
    openPopover(anchor, { title, items: items.map((v) => (typeof v === "string" ? { value: v, label: v } : v)), returnSelector, ...extra });
  if (kind === "voucher")
    return single("Assign Voucher", voucherChoices(), { onPick: (v) => runBulkFlow(ctx, "voucher", { voucher: v }, rows) });
  if (kind === "adminGroup") {
    const { items, note } = groupChoices(ctx, rows);
    return single("Assign Admin Group", items, { note, onPick: (g) => runBulkFlow(ctx, "adminGroup", { group: g }, rows) });
  }
  if (kind === "team")
    return single("Add to Team", db.teams, {
      footer: [{ label: "Create a New Team", run: () => createTeamThen((name) => runBulkFlow(ctx, "team", { team: name }, rows)) }],
      onPick: (t) => runBulkFlow(ctx, "team", { team: t }, rows),
    });
  if (kind === "workRole")
    return single("Set Work Role", WORK_ROLES, { custom: { label: "Use" }, placeholder: "Search or type a work role", onPick: (r) => runBulkFlow(ctx, "workRole", { workRole: r }, rows) });
  if (kind === "role")
    return single("Change Role", ["Admin", "Limited Admin", "Viewer"], { onPick: (r) => runBulkFlow(ctx, "role", { role: r }, rows) });
  if (kind.startsWith("access-")) {
    const field = kind.slice(7);
    const items = { voucher: VOUCHERS, adminGroup: db.groups, team: db.teams }[field].map((v) => ({ value: v, label: v }));
    const titles = { voucher: "Voucher Access", adminGroup: "Admin Group Access", team: "Team Access" };
    return openPopover(anchor, {
      title: titles[field],
      items,
      multi: true,
      modes: [{ value: "add", label: "Add" }, { value: "remove", label: "Remove" }, { value: "replace", label: "Replace with" }],
      note: field === "adminGroup" ? "Only groups covered by each person's vouchers are applied. Others are skipped, with a reason." : field === "voucher" ? "Limited Admins can only have one voucher." : "",
      applyLabel: "Review Change",
      returnSelector,
      onPick: (names, mode) => runBulkFlow(ctx, "portalAccess", { field, mode, names }, rows),
    });
  }
}
var WORK_ROLES = ["Security Program Lead", "SOC Analyst I", "SOC Analyst II", "Cloud Security Engineer", "ICS/OT Security Engineer"];

function createTeamThen(next) {
  state.modal = "bulk-new-team";
  openModal(
    "Create a New Team",
    "",
    `<form id="bulk-team-form"><div class="field"><label for="bulk-team-name">Team Name</label><input id="bulk-team-name" name="name" required autocomplete="off"><p class="inline-error" id="bulk-team-error" role="alert"></p></div></form>`,
    `<div class="actions">${btn("Cancel", "close-modal", "text")}<button class="button primary" type="submit" form="bulk-team-form">Create and Use</button></div>`,
    "",
    true,
  );
  state.bulkAfterTeam = next;
  $("#bulk-team-name")?.focus();
}
document.addEventListener("submit", (event) => {
  if (event.target.id !== "bulk-team-form") return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const name = new FormData(event.target).get("name").trim();
  if (!name || db.teams.some((t) => t.toLowerCase() === name.toLowerCase())) {
    $("#bulk-team-error").textContent = "Enter a unique team name.";
    return;
  }
  const after = state.bulkAfterTeam;
  state.bulkAfterTeam = null;
  if (dispatch((st) => st.createTeam(name))) {
    $("#modal").close();
    state.modal = null;
    after?.(name);
  }
}, true);

const DESTRUCTIVE = (kind, params) => kind === "remove" || kind === "removeStudent" || kind === "removePortal" || (kind === "status" && params.status === "Suspended");

function previewLines(ctx, kind, params, result) {
  const lines = [];
  const noun = ctx.noun;
  if (kind === "voucher")
    lines.push(`${result.applied.length} will move to this voucher.${result.unchanged.length ? ` ${result.unchanged.length} ${result.unchanged.length === 1 ? "is" : "are"} already on it.` : ""}`);
  else
    lines.push(`${pluralize(result.applied.length, noun[0], noun[1])} will change.${result.unchanged.length ? ` ${result.unchanged.length} already ${result.unchanged.length === 1 ? "has" : "have"} this.` : ""}`);
  const grouped = new Map();
  for (const item of result.cleared) {
    const key = `${item.field}|${item.value}`;
    grouped.set(key, (grouped.get(key) || 0) + 1);
  }
  for (const [key, count] of grouped) {
    const [field, value] = key.split("|");
    const people = pluralize(count, "person", "people");
    lines.push(
      kind === "voucher"
        ? `⚠ Admin group ${value} will be cleared for ${people}, because this voucher does not cover it.`
        : `⚠ ${field.charAt(0).toUpperCase() + field.slice(1)} ${value} will be removed for ${people}.`,
    );
  }
  if (result.invitesReleased) lines.push(`${pluralize(result.invitesReleased, "invitation")} will be sent.`);
  if (kind === "status") lines.push("They will not be able to use their access until you reactivate them.");
  if (kind === "remove") lines.push("They will be removed from your organization. Their activity history is kept.");
  if (kind === "removeStudent") lines.push("Anyone who also has portal access keeps it. Their activity history is kept.");
  if (kind === "removePortal") lines.push("They will no longer be able to sign in to the portal.");
  return lines;
}

function skippedList(result, limit = 6) {
  if (!result.skipped.length) return "";
  const shown = result.skipped.slice(0, limit);
  return `<div class="bulk-skipped"><p><strong>${pluralize(result.skipped.length, "row")} will be skipped</strong></p><ul>${shown.map((s) => `<li><strong>${esc(s.name)}</strong>: ${esc(s.reason)}</li>`).join("")}${result.skipped.length > limit ? `<li>and ${result.skipped.length - limit} more</li>` : ""}</ul></div>`;
}

function bulkTitle(ctx, kind, params, count) {
  const noun = pluralize(count, ctx.noun[0], ctx.noun[1]);
  return {
    voucher: `Assign ${noun} to ${params.voucher}?`,
    adminGroup: `Assign ${noun} to ${params.group}?`,
    team: params.team ? `Add ${noun} to ${params.team}?` : `Remove ${noun} from their team?`,
    status: params.status === "Suspended" ? `Suspend ${noun}?` : `Reactivate ${noun}?`,
    remove: `Remove ${noun} from your organization?`,
    removeStudent: `Remove ${noun} from Students?`,
    removePortal: `Remove portal access for ${noun}?`,
    role: `Change ${noun} to ${params.role}?`,
    portalAccess: `${{ add: "Add", remove: "Remove", replace: "Replace" }[params.mode]} ${{ voucher: "voucher", adminGroup: "admin group", team: "team" }[params.field]} access for ${noun}?`,
  }[kind] || `Update ${noun}?`;
}
function confirmLabel(kind, params) {
  return { voucher: "Assign Voucher", adminGroup: "Assign Admin Group", team: params.team ? "Add to Team" : "Remove From Team", status: params.status === "Suspended" ? "Suspend" : "Reactivate", remove: "Remove", removeStudent: "Remove as Student", removePortal: "Remove Access", role: "Change Role", portalAccess: "Apply Change" }[kind] || "Apply";
}

function summaryText(ctx, kind, params, result) {
  const n = result.applied.length;
  const noun = ctx.noun;
  const who = pluralize(n, noun[0], noun[1]);
  const base = {
    voucher: `Assigned ${who} to ${params.voucher}`,
    adminGroup: `Assigned ${who} to ${params.group}`,
    team: params.team ? `Added ${who} to ${params.team}` : `Removed ${who} from their team`,
    workRole: `Set the work role for ${who}`,
    status: params.status === "Suspended" ? `Suspended ${who}` : `Reactivated ${who}`,
    resend: `Resent ${pluralize(n, "invitation")}`,
    remove: `Removed ${who} and archived them`,
    deletePermanently: `Permanently deleted ${who}`,
    removeStudent: `Removed ${who} from Students`,
    removeFromImport: `Removed ${pluralize(n, "row")} from the import`,
    removePortal: `Removed portal access for ${who}`,
    role: `Changed ${who} to ${params.role}`,
    portalAccess: `${{ add: "Added", remove: "Removed", replace: "Replaced" }[params.mode]} ${{ voucher: "voucher", adminGroup: "admin group", team: "team" }[params.field]} access for ${who}`,
  }[kind];
  if (!n) return `No changes made${result.skipped.length ? ` · ${result.skipped.length} skipped` : result.unchanged.length ? ` · ${result.unchanged.length} already set` : ""}`;
  const extra = [];
  if (result.invitesReleased) extra.push(`${pluralize(result.invitesReleased, "invitation")} sent`);
  if (result.skipped.length) extra.push(`${result.skipped.length} skipped`);
  if (result.unchanged.length) extra.push(`${result.unchanged.length} already set`);
  return [base, ...extra].join(" · ");
}

function showBulkResult(ctx, kind, params, result) {
  state.modal = "bulk-result";
  openModal(
    "What Happened",
    summaryText(ctx, kind, params, result),
    `${result.skipped.length ? `<h3 class="bulk-heading">Skipped</h3><ul class="bulk-list">${result.skipped.map((s) => `<li><strong>${esc(s.name)}</strong>: ${esc(s.reason)}</li>`).join("")}</ul>` : ""}${result.cleared.length ? `<h3 class="bulk-heading">Cleared</h3><ul class="bulk-list">${result.cleared.map((c) => `<li><strong>${esc(c.name)}</strong>: ${esc(c.field)} ${esc(c.value)}</li>`).join("")}</ul>` : ""}`,
    `<div class="actions">${btn("Close", "close-modal", "primary")}</div>`,
    "",
    true,
  );
}

function reportBulk(ctx, kind, params, result) {
  const actions = [];
  if (result.applied.length && result.undo) actions.push({ label: "Undo", run: result.undo });
  else if (result.applied.length && result.undoId)
    actions.push({ label: "Undo", run: () => undoBulk(ctx, result) });
  if (result.skipped.length || result.cleared.length) actions.push({ label: "Details", run: () => showBulkResult(ctx, kind, params, result) });
  toastWith(summaryText(ctx, kind, params, result), actions);
}
function undoBulk(ctx, result) {
  try {
    let outcome;
    if (dispatch((st) => { outcome = st.undo(result.undoId); }))
      toast(outcome.skipped.length ? `Undid ${outcome.restored} · ${outcome.skipped.length} changed since and ${outcome.skipped.length === 1 ? "was" : "were"} left alone` : "Undone");
  } catch (error) {
    toast(error.message);
  }
}

function applyBulk(ctx, kind, params, ids) {
  const result = ctx.run(kind, ids, params);
  if (result) {
    reportBulk(ctx, kind, params, result);
    if (result.applied.length && ctx.key !== "import" && kind !== "removeStudent" && kind !== "remove" && kind !== "removePortal") {
      state.highlight = new Set(result.applied.map((item) => item.id));
      setTimeout(() => {
        state.highlight = null;
        if (state.view === ctx.key) render();
      }, 4000);
      render();
    }
  }
  return result;
}

// Most changes apply straight away with Undo. Changes with knock-on effects, and
// destructive ones, show a short preview first.
function runBulkFlow(ctx, kind, params, rows) {
  const ids = rows.map((r) => r.id);
  const preview = ctx.run(kind, ids, params, { dryRun: true });
  const confirm =
    preview.applied.length > 0 &&
    (DESTRUCTIVE(kind, params) || preview.cleared.length > 0 || (preview.invitesReleased > 0 && ids.length > 1));
  if (!confirm) return applyBulk(ctx, kind, params, ids);
  state.bulkPending = () => {
    $("#modal").close();
    state.modal = null;
    applyBulk(ctx, kind, params, ids);
  };
  state.modal = "bulk-preview";
  openModal(
    bulkTitle(ctx, kind, params, ids.length),
    "",
    `${previewLines(ctx, kind, params, preview).map((line) => `<p class="bulk-line">${esc(line)}</p>`).join("")}${skippedList(preview)}`,
    `<div class="actions">${btn("Cancel", "close-modal", "text")}${btn(confirmLabel(kind, params), "bulk-confirm", DESTRUCTIVE(kind, params) ? "danger" : "primary")}</div>`,
    "",
    true,
  );
}

function exportSelected(ctx) {
  const rows = selectedRows(ctx);
  const cell = (value) => {
    let text = String(value ?? "");
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return csvEscape(text);
  };
  const header = ["name", "email", "work_role", "status", "voucher", "admin_group", "team"];
  const lines = rows.map((r) => [r.name, r.email, r.workRole, r.status || "", r.vouchers ? r.vouchers.join("; ") : r.voucher, r.groups ? r.groups.join("; ") : r.group, r.teams ? r.teams.join("; ") : r.team].map(cell).join(","));
  download(`sans-selected-${ctx.key}.csv`, [header.join(","), ...lines].join("\r\n"), "text/csv");
  toast(`Exported ${pluralize(rows.length, "row")}`);
}

// ---------- Events ----------
document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  const ctx = () => bulkContext();
  try {
    if (action === "chip") {
      // The selection is kept, so rows a chip hides are reported as "hidden by filters".
      chipKey()[state.view] = target.dataset.chip;
      render();
    } else if (action === "bulk-clear") {
      state.selected = [];
      state.bulkMore = false;
      render();
    } else if (action === "bulk-select-all") {
      state.selected = ctx().rows.map((r) => r.id);
      render();
    } else if (action === "bulk-more") {
      state.bulkMore = !state.bulkMore;
      render();
      document.querySelector('[data-action="bulk-more"]')?.focus();
    } else if (action === "bulk-open") {
      state.bulkMore = false;
      const c = ctx();
      if (c?.key === "import" && target.dataset.kind === "removeFromImport") return runBulkFlow(c, "removeFromImport", {}, selectedRows(c));
      openBulkPicker(c, target.dataset.kind, target);
    } else if (action === "bulk-more-item") {
      const c = ctx();
      const kind = target.dataset.kind;
      state.bulkMore = false;
      const rows = selectedRows(c);
      if (kind === "export") exportSelected(c);
      else if (kind === "team-clear") runBulkFlow(c, "team", { team: "" }, rows);
      else if (kind === "resend") runBulkFlow(c, "resend", {}, rows);
      else if (kind === "removeDialog") openRemoveDialog(rows.map((r) => r.id));
      else if (kind === "suspend") runBulkFlow(c, "status", { status: "Suspended" }, rows);
      else if (kind === "reactivate") runBulkFlow(c, "status", { status: "Active" }, rows);
      else runBulkFlow(c, kind, {}, rows);
      render();
    } else if (action === "bulk-confirm") {
      const run = state.bulkPending;
      state.bulkPending = null;
      run?.();
    } else if (action === "cell-pick") {
      openCellPicker(target);
    } else if (action === "banner-review-needs-voucher") {
      chipKey().students = "needsVoucher";
      render();
    }
  } catch (error) {
    toast(error.message);
  }
});
document.addEventListener("click", (event) => {
  if (state.bulkMore && !event.target.closest(".bulk-more-menu,[data-action=bulk-more]")) {
    state.bulkMore = false;
    render();
  }
});
const bulkBaseNavigate = navigate;
navigate = function (view) {
  state.bulkMore = false;
  closePopover(false);
  bulkBaseNavigate(view);
};

// A cell link opens the same pop-over for one row.
function openCellPicker(anchor) {
  const ctx = bulkContext();
  const kind = anchor.dataset.kind;
  const id = anchor.dataset.row;
  const row = ctx.rowFor(id);
  if (!row) return;
  const returnSelector = `[data-action="cell-pick"][data-kind="${kind}"][data-row="${id}"]`;
  const open = (title, items, params, extra = {}) =>
    openPopover(anchor, { title, items: items.map((v) => ({ value: v, label: v })), returnSelector, ...extra, onPick: (value) => runBulkFlow(ctx, params.kind, params.build(value), [row]) });
  if (kind === "voucher") return open("Assign Voucher", voucherChoices(), { kind: "voucher", build: (v) => ({ voucher: v }) });
  if (kind === "adminGroup") {
    const { items, note } = groupChoices(ctx, [row]);
    return open("Assign Admin Group", items, { kind: "adminGroup", build: (g) => ({ group: g }) }, { note: items.length ? note : "Add a voucher first to see its admin groups." });
  }
  if (kind === "team")
    return open("Add to Team", db.teams, { kind: "team", build: (t) => ({ team: t }) }, { footer: [{ label: "Create a New Team", run: () => createTeamThen((name) => runBulkFlow(ctx, "team", { team: name }, [row])) }] });
  if (kind === "workRole")
    return open("Set Work Role", WORK_ROLES, { kind: "workRole", build: (r) => ({ workRole: r }) }, { custom: { label: "Use" }, placeholder: "Search or type a work role" });
}

// ---------- Students table extras ----------
function voucherFlag(u) {
  if (u.type !== "student" || u.status !== "Needs voucher") return "";
  if (!actorCanBulk()) return "";
  return `<button type="button" class="inline-assignment needs-voucher-flag" data-action="cell-pick" data-kind="voucher" data-row="${esc(u.id)}"><span class="error-icon">${icon("error")}</span>Assign Voucher</button>`;
}
function rowHighlight(u) {
  return state.highlight?.has(u.id) ? ' class="row-highlight"' : "";
}
function studentBanners() {
  const needs = db.users.filter((u) => u.type === "student" && u.status === "Needs voucher").length;
  const drafts = db.importDrafts || [];
  return `${drafts.map((d) => `<div class="note import-banner" role="status" data-spec="students.import-banner" data-spec-label="Unfinished import banner">${icon("info")}<div><strong>You have an unfinished import</strong> <span>${esc(d.fileName)} · ${pluralize(d.rows.length, "row")}</span></div><div class="banner-actions">${btn("Resume", "import-resume", "small primary", `data-id="${esc(d.id)}"`)}${btn("Discard", "import-discard", "small", `data-id="${esc(d.id)}"`)}</div></div>`).join("")}${needs ? `<div class="note voucher-banner" role="status" data-spec="students.voucher-banner" data-spec-label="Needs voucher banner">${icon("error")}<div><strong>${pluralize(needs, "student needs", "students need")} a voucher</strong> <span>before ${needs === 1 ? "they" : "they"} can be invited.</span></div><div class="banner-actions">${btn("Review", "banner-review-needs-voucher", "small")}</div></div>` : ""}`;
}
const bulkBasePeopleView = peopleView;
peopleView = function () {
  const html = bulkBasePeopleView();
  if (!chipsFor(state.view)) return html;
  return html
    .replace('<section class="card people-card"', `${state.view === "students" ? studentBanners() : ""}<section class="card people-card"`)
    .replace('<div class="table-wrap">', `${tableChipsHtml()}<div class="table-wrap">`);
};
// The first render happens in app.js, before this file loads, so a page opened straight onto
// Students or Portal users would miss its chips and banners until something re-rendered.
if (chipsFor(state.view)) render();

// ---------- Keyboard: Shift-click a range, Ctrl/Cmd-A selects all visible, Esc clears ----------
var shiftHeld = false;
document.addEventListener("click", (event) => {
  shiftHeld = event.shiftKey;
}, true);
document.addEventListener("change", (event) => {
  const box = event.target.closest?.(".row-check[data-select]");
  if (!box || box.dataset.select === "all" || !bulkContext()) return;
  const ids = [...document.querySelectorAll(".row-check[data-select]")].map((b) => b.dataset.select).filter((id) => id !== "all");
  const last = state.lastChecked;
  if (shiftHeld && last && ids.includes(last)) {
    event.stopImmediatePropagation();
    const [from, to] = [ids.indexOf(last), ids.indexOf(box.dataset.select)].sort((a, b) => a - b);
    const range = ids.slice(from, to + 1);
    state.selected = box.checked
      ? [...new Set([...state.selected, ...range])]
      : state.selected.filter((id) => !range.includes(id));
    render();
  }
  state.lastChecked = box.dataset.select;
}, true);
document.addEventListener("keydown", (event) => {
  const ctx = bulkContext();
  if (!ctx || popover || $("#modal").open) return;
  if (event.key === "Escape" && state.selected.length) {
    state.selected = [];
    state.bulkMore = false;
    render();
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a" && event.target.closest?.("table, .bulk-bar")) {
    event.preventDefault();
    state.selected = [...new Set([...state.selected, ...ctx.visible.map((u) => u.id)])];
    render();
  }
});

// ---------- Remove people: one dialog, four outcomes ----------
// Remove admin access, remove as a student, remove both and archive, or erase.
function personKey(id) {
  return String(id).replace(/--(portal|student)$/, "");
}
function openRemoveDialog(rowIds) {
  const snapshot = store.snapshot();
  const actor = snapshot.people.find((p) => p.id === snapshot.session.actorId);
  const role = actor?.portal?.role;
  const full = ["Admin", "SSO Admin"].includes(role);
  if (!full && role !== "Limited Admin") return toast("You do not have permission to remove people.");
  const people = [...new Set(rowIds.map(personKey))].map((id) => snapshot.people.find((p) => p.id === id)).filter(Boolean);
  if (!people.length) return;
  const many = people.length > 1;
  const who = many ? `${people.length} people` : people[0].name;
  const some = (test) => people.filter(test).length;
  const withPortal = some((p) => p.portal);
  const withStudent = some((p) => p.student);
  const withBoth = some((p) => p.portal && p.student);
  const detail = (count, text) => (many && count < people.length ? `${text} Applies to the ${count} of ${people.length} who ${count === 1 ? "has" : "have"} it.` : text);
  const options = [];
  if (withPortal)
    options.push({ kind: "removePortal", label: "Remove Admin Access", allowed: full, note: detail(withPortal, many ? "They can no longer sign in to the portal. They stay on as students if they are one." : "They can no longer sign in to the portal. Any student record stays.") });
  if (withStudent)
    options.push({ kind: "removeStudent", label: "Remove as a Student", allowed: true, note: detail(withStudent, many ? "They are removed from Students. Anyone who also has admin access keeps it." : "They are removed from Students. Any admin access stays.") });
  if (withBoth)
    options.push({ kind: "remove", label: `Remove both and archive the ${many ? "users" : "user"}`, allowed: full, note: detail(withBoth, "They are hidden from every list. Their activity history is kept.") });
  options.push({ kind: "deletePermanently", label: "Permanently delete all data associated with this user", allowed: full, danger: true, note: "Deletes the person, their training records and certifications. In the activity log their name is replaced with “Deleted user”. This cannot be undone." });
  state.modal = "remove-person";
  state.removeRows = rowIds;
  openModal(
    `Remove ${who}?`,
    "Choose what to remove.",
    `<form id="remove-form" data-spec="people.remove-dialog" data-spec-label="Remove dialog"><fieldset class="remove-options"><legend class="sr-only">What to Remove</legend>${options
      .map((o, i) => `<label class="remove-option${o.danger ? " danger" : ""}${o.allowed ? "" : " disabled"}"><input type="radio" name="removal" value="${o.kind}" ${o.allowed ? "" : "disabled"} ${i === 0 && o.allowed ? "" : ""}><span><strong>${esc(o.label)}</strong><small>${esc(o.allowed ? o.note : "Only Admins can do this.")}</small></span></label>`)
      .join("")}</fieldset><div class="field remove-confirm" hidden><label for="remove-confirm-text">Type DELETE to Confirm</label><input id="remove-confirm-text" autocomplete="off" aria-describedby="remove-confirm-hint"><p class="hint" id="remove-confirm-hint">This permanently erases ${esc(many ? "these people" : people[0].name)}.</p></div></form>`,
    `<div class="actions">${btn("Cancel", "close-modal", "text")}${btn("Remove", "remove-confirm", "danger", "disabled id=\"remove-confirm-button\"")}</div>`,
    "",
    true,
  );
  $("#remove-form input[type=radio]:not(:disabled)")?.focus();
}
function removeFormState() {
  const form = $("#remove-form");
  if (!form) return null;
  const kind = form.querySelector("input[name=removal]:checked")?.value || "";
  const typed = $("#remove-confirm-text")?.value.trim() === "DELETE";
  return { kind, ready: Boolean(kind) && (kind !== "deletePermanently" || typed) };
}
function syncRemoveForm() {
  const current = removeFormState();
  if (!current) return;
  $(".remove-confirm").hidden = current.kind !== "deletePermanently";
  const button = $("#remove-confirm-button");
  button.disabled = !current.ready;
  button.textContent = current.kind === "deletePermanently" ? "Permanently Delete" : "Remove";
}
document.addEventListener("change", (event) => {
  if (event.target.closest("#remove-form")) syncRemoveForm();
});
document.addEventListener("input", (event) => {
  if (event.target.id === "remove-confirm-text") syncRemoveForm();
});
function runRemoval() {
  const current = removeFormState();
  if (!current?.ready) return;
  const snapshot = store.snapshot();
  const people = [...new Set(state.removeRows.map(personKey))].map((id) => snapshot.people.find((p) => p.id === id)).filter(Boolean);
  const rowFor = (person, type) => `${person.id}--${type}`;
  const ids =
    current.kind === "removePortal" ? people.filter((p) => p.portal).map((p) => rowFor(p, "portal"))
    : current.kind === "removeStudent" ? people.filter((p) => p.student).map((p) => rowFor(p, "student"))
    : people.map((p) => rowFor(p, p.portal ? "portal" : "student"));
  $("#modal").close();
  state.modal = null;
  const ctx = { key: state.view, noun: ["person", "people"] };
  const result = storeRun(current.kind, ids, {});
  state.selected = [];
  if (result) reportBulk(ctx, current.kind, {}, result);
  if (state.view === "profile") {
    const remaining = db.users.find((u) => u.personId === personKey(state.profileId));
    if (!remaining) navigate(state.profileFrom === "students" ? "students" : "portal");
    else {
      state.profileId = remaining.id;
      render();
    }
  }
}
document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  if (target.dataset.action === "delete-user") {
    event.preventDefault();
    event.stopImmediatePropagation();
    state.rowMenu = null;
    openRemoveDialog([target.dataset.id]);
  } else if (target.dataset.action === "remove-confirm") {
    event.preventDefault();
    event.stopImmediatePropagation();
    runRemoval();
  }
}, true);
