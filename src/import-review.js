// CSV review: fix patchy rows one at a time or in bulk, then press Done. Rows are
// checked with checkStudentRow(), edited with the shared pop-over and bulk bar,
// and saved as a draft in the database so an import survives leaving or reloading.
// Loads after bulk-ui.js, which provides the building blocks.

var importPersistTimer;

// ---------- Row problems ----------
function importAccountExists(email) {
  return accountLinked(email) || Boolean(linkedPerson(email, "portal"));
}
function rowProblems(row) {
  return checkStudentRow(row, {
    existing: db.users.filter((u) => u.type === "student"),
    batch: state.staged,
    directory: db,
    requireVoucher: false,
    accountExists: importAccountExists,
  });
}
// Anything still calling the old check gets only the problems that block adding a row.
importErrors = function (row) {
  return rowProblems(row).filter((p) => p.level === "error").map((p) => p.message);
};
function importStatus(row) {
  return rowStatus(rowProblems(row));
}
// The same checks as the review screen, run on a freshly read file before it's staged,
// so the upload step can say what was found.
function precheckImport(rows) {
  const out = { total: rows.length, ready: 0, needsVoucher: 0, error: 0, problems: {}, newAccount: 0, alsoPortal: 0 };
  const existing = db.users.filter((u) => u.type === "student");
  for (const row of rows) {
    const problems = checkStudentRow(row, { existing, batch: rows, directory: db, requireVoucher: false, accountExists: importAccountExists });
    const status = rowStatus(problems);
    out[status] += 1;
    for (const p of problems) {
      if (p.level === "error") out.problems[p.code] = (out.problems[p.code] || 0) + 1;
      if (p.code === "new_account" && status === "ready") out.newAccount += 1;
    }
    if (status === "ready" && linkedPerson(String(row.email).trim().toLowerCase(), "portal")) out.alsoPortal += 1;
  }
  return out;
}
function importCounts() {
  const counts = { all: state.staged.length, error: 0, needsVoucher: 0, ready: 0, noGroup: 0, noTeam: 0 };
  for (const row of state.staged) {
    counts[importStatus(row)] += 1;
    if (!row.group) counts.noGroup += 1;
    if (!row.team) counts.noTeam += 1;
  }
  return counts;
}
const IMPORT_CHIPS = [
  ["all", "All", () => true],
  ["error", "Errors", (r) => importStatus(r) === "error"],
  ["needsVoucher", "Needs voucher", (r) => importStatus(r) === "needsVoucher"],
  ["noGroup", "No admin group", (r) => !r.group],
  ["noTeam", "No team", (r) => !r.team],
  ["ready", "Ready", (r) => importStatus(r) === "ready"],
];
function importChipMatches(row) {
  const chip = IMPORT_CHIPS.find((c) => c[0] === activeChip("import"));
  return !chip || chip[2](row);
}

// ---------- Drafts ----------
function persistImportDraft() {
  clearTimeout(importPersistTimer);
  importPersistTimer = setTimeout(() => {
    if (!state.importDraftId) return;
    try {
      store.saveImportDraft({
        id: state.importDraftId,
        fileName: state.importMeta.fileName,
        uploadedAt: state.importMeta.uploadedAt,
        rows: state.staged,
      });
      db = store.view();
    } catch (error) {
      toast("This import could not be saved. Your changes are kept until you leave the page.");
    }
  }, 250);
}
function startImport(rows, fileName) {
  state.staged = rows.map((row, index) => ({ ...row, id: row.id || uid(), row: row.row || index + 2 }));
  state.importDraftId = uid();
  state.importMeta = { fileName, uploadedAt: new Date().toISOString() };
  state.selected = [];
  chipKey().import = "all";
  persistImportDraft();
}
function resumeImport(id) {
  const draft = store.snapshot().importDrafts.find((item) => item.id === id);
  if (!draft) return toast("That import is no longer available.");
  state.staged = draft.rows;
  state.importDraftId = draft.id;
  state.importMeta = { fileName: draft.fileName, uploadedAt: draft.uploadedAt };
  state.selected = [];
  chipKey().import = "all";
  navigate("import");
}
function leaveImport() {
  clearTimeout(importPersistTimer);
  if (state.importDraftId && state.staged.length) {
    try {
      store.saveImportDraft({ id: state.importDraftId, fileName: state.importMeta.fileName, uploadedAt: state.importMeta.uploadedAt, rows: state.staged });
      db = store.view();
    } catch {}
  }
  state.staged = [];
  state.importDraftId = null;
  navigate("students");
}
function discardImport(id) {
  dispatch((st) => st.discardImportDraft(id));
  if (state.importDraftId === id) {
    state.staged = [];
    state.importDraftId = null;
  }
}

// ---------- Local bulk actions on the staged rows ----------
function importRun(kind, ids, params, { dryRun = false } = {}) {
  const rows = dryRun ? structuredClone(state.staged) : state.staged;
  const snapshot = dryRun ? null : structuredClone(state.staged);
  const result = { kind, applied: [], unchanged: [], skipped: [], cleared: [], invitesReleased: 0 };
  const entryFor = (row) => ({ id: row.id, name: row.name || row.email });
  for (const id of ids) {
    const row = rows.find((r) => r.id === id);
    if (!row) continue;
    const entry = entryFor(row);
    if (kind === "voucher") {
      if (row.voucher === params.voucher) result.unchanged.push(entry);
      else {
        row.voucher = params.voucher;
        if (row.group && !groupsForVouchers([params.voucher], db.groups).includes(row.group)) {
          result.cleared.push({ ...entry, field: "admin group", value: row.group });
          row.group = "";
        }
        result.applied.push(entry);
      }
    } else if (kind === "adminGroup") {
      if (!row.voucher) result.skipped.push({ ...entry, reason: "Needs a voucher before an admin group can be assigned" });
      else if (!groupsForVouchers([row.voucher], db.groups).includes(params.group)) result.skipped.push({ ...entry, reason: `${params.group} is not covered by ${row.voucher}` });
      else if (row.group === params.group) result.unchanged.push(entry);
      else {
        row.group = params.group;
        result.applied.push(entry);
      }
    } else if (kind === "team") {
      if ((row.team || "") === (params.team || "")) result.unchanged.push(entry);
      else {
        row.team = params.team || "";
        result.applied.push(entry);
      }
    } else if (kind === "workRole") {
      if (row.workRole === params.workRole) result.unchanged.push(entry);
      else {
        row.workRole = params.workRole;
        result.applied.push(entry);
      }
    } else if (kind === "removeFromImport") {
      result.applied.push(entry);
    }
  }
  if (dryRun) return result;
  if (kind === "removeFromImport") {
    const gone = new Set(result.applied.map((e) => e.id));
    state.staged = state.staged.filter((r) => !gone.has(r.id));
    state.selected = state.selected.filter((id) => !gone.has(id));
  }
  if (result.applied.length) {
    result.undo = () => {
      state.staged = snapshot;
      persistImportDraft();
      render();
      toast("Undone");
    };
    persistImportDraft();
  }
  render();
  return result;
}
function importContext() {
  const rows = state.staged;
  return {
    key: "import",
    noun: ["row", "rows"],
    rows,
    visible: rows.filter((r) => matchesFilters(r, true)),
    run: importRun,
    canEdit: true,
    rowFor: (id) => rows.find((r) => r.id === id),
  };
}

// ---------- The review screen ----------
function importCell(row, kind, label, value, problem) {
  const missing = kind === "voucher" && !value;
  const cls = ["inline-assignment", value ? "assigned" : "", missing ? "cell-warn" : "", problem ? "cell-error" : ""].filter(Boolean).join(" ");
  const aria = value ? `${label}: ${value}. Change` : `Add ${label.toLowerCase()}`;
  const text = value || (kind === "voucher" ? "Add voucher" : kind === "workRole" ? "Add work role" : kind === "group" ? "Add admin group" : "Add to team");
  const pickKind = kind === "group" ? "adminGroup" : kind;
  return `<button type="button" class="${cls}" data-action="cell-pick" data-kind="${pickKind}" data-row="${esc(row.id)}" aria-label="${esc(aria)}">${missing ? `<span class="error-icon">${icon("error")}</span>` : ""}${!value && !missing ? "+ " : ""}${esc(text)}</button>`;
}
function importStatusCell(row, problems, status) {
  const info = problems.find((p) => p.level === "info");
  const text = status === "error" ? problems.filter((p) => p.level === "error").map((p) => p.message).join(". ") : status === "needsVoucher" ? "Needs a voucher. It will be added but not invited yet" : "Ready to add";
  const symbol = status === "error" ? icon("close") : status === "needsVoucher" ? icon("error") : icon("check");
  const label = { error: "Error", needsVoucher: "Needs voucher", ready: "Ready" }[status];
  return `<span class="import-status ${status}" tabindex="0" role="img" aria-label="${esc(`${label}: ${text}`)}" title="${esc(text)}">${symbol}</span>${info ? `<span class="secondary account-pending">New SANS account</span>` : ""}`;
}
function importRowMenu(row, index) {
  if (state.importMenu !== row.id) return "";
  const item = (action, label, data = "") => `<button type="button" role="menuitem" data-action="${action}" ${data}>${esc(label)}</button>`;
  const pick = (kind, label) => item("cell-pick", label, `data-kind="${kind}" data-row="${esc(row.id)}"`);
  return `<div class="dropdown-menu row-dropdown import-row-menu" role="menu">${item("edit-import", "Edit row", `data-index="${index}"`)}${pick("voucher", "Assign voucher")}${pick("adminGroup", "Assign admin group")}${pick("team", "Add to team")}${item("import-remove-row", "Remove from import", `data-id="${esc(row.id)}"`)}</div>`;
}
function importToolbarHtml() {
  return `<div class="toolbar fidelity-toolbar import-toolbar"><div class="search">${icon("search")}<input id="people-search" placeholder="Search name or email" aria-label="Search name or email" value="${esc(state.search)}"></div></div>`;
}
importView = function () {
  const counts = importCounts();
  const ctx = importContext();
  const rows = ordered(ctx.visible);
  const chips = chipsHtml(IMPORT_CHIPS.map(([key, text]) => [key, text, counts[key]]), activeChip("import"), "Quick filters");
  const meta = state.importMeta
    ? `${esc(state.importMeta.fileName)} · uploaded ${new Date(state.importMeta.uploadedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} · ${pluralize(state.staged.length, "row")}`
    : "";
  const allChecked = rows.length > 0 && rows.every((r) => state.selected.includes(r.id));
  return `<button class="back" data-action="import-cancel">${icon("back")}Back to Students</button>${heading("Review import", meta, `${btn("Discard import", "import-discard-confirm", "text")}${btn("Done", "fidelity-import-done", "primary")}`)}<section class="card import-card" aria-label="Rows in this import">${state.selected.length ? bulkBarHtml(ctx) : importToolbarHtml()}${chips}<div class="table-wrap"><table class="csv-review-table"><colgroup><col class="col-check"><col style="width:21%"><col style="width:15%"><col style="width:17%"><col style="width:16%"><col style="width:15%"><col style="width:10%"><col class="col-menu"></colgroup><thead><tr><th class="selection-col">${checkRow("all", allChecked, "Select all visible import rows")}</th>${tableHead("Name / email", "name")}${tableHead("Work role", "workRole", false)}${tableHead("Voucher", "voucher", false)}${tableHead("Admin group", "group", false)}${tableHead("Team", "team", false)}${tableHead("Status", "status", false)}<th></th></tr></thead><tbody>${
    rows
      .map((row) => {
        const index = state.staged.indexOf(row);
        const problems = rowProblems(row);
        const status = rowStatus(problems);
        const errors = problems.filter((p) => p.level === "error");
        const coded = (code) => errors.some((p) => p.code === code);
        return `<tr class="import-row ${status}"><td class="selection-col">${checkRow(row.id, state.selected.includes(row.id), "Select " + row.email)}</td><td><button type="button" class="name-edit" data-action="edit-import" data-index="${index}">${row.name ? `<strong>${esc(row.name)}</strong>` : ""}<span>${esc(row.email)}</span></button>${errors.length ? `<span class="row-error">${errors.map((p) => esc(p.message)).join("<br>")}</span>` : ""}</td><td>${importCell(row, "workRole", "Work role", row.workRole)}</td><td>${importCell(row, "voucher", "Voucher", row.voucher, coded("unknown_voucher"))}</td><td>${importCell(row, "group", "Admin group", row.group, coded("group_not_covered") || coded("unknown_group"))}</td><td>${importCell(row, "team", "Team", row.team, coded("unknown_team"))}</td><td class="status-cell">${importStatusCell(row, problems, status)}</td><td class="menu-cell"><div class="menu-anchor row-menu-anchor"><button type="button" class="icon-btn kebab" data-action="import-row-menu" data-id="${esc(row.id)}" aria-label="Actions for ${esc(row.name || row.email)}" aria-haspopup="menu" aria-expanded="${state.importMenu === row.id}">${menuIcon()}</button>${importRowMenu(row, index)}</div></td></tr>`;
      })
      .join("") ||
    `<tr><td colspan="8"><div class="empty"><h2>${state.staged.length ? "No matching rows" : "Nothing left to review"}</h2>${state.staged.length ? btn("Clear filters", "all-filters-clear") : btn("Back to Students", "import-cancel")}</div></td></tr>`
  }</tbody></table></div><p class="sr-only" role="status">${counts.ready} ready, ${counts.needsVoucher} need a voucher, ${counts.error} with errors</p></section>`;
};

// ---------- Editing a whole row ----------
const importBaseEditForm = editForm;
editForm = function (id, index = null) {
  importBaseEditForm(id, index);
  if (index !== null) $("#edit-voucher")?.removeAttribute("required");
};
const importBaseSaveEdit = saveEdit;
saveEdit = function () {
  if (state.modal !== "edit-import") return importBaseSaveEdit();
  const row = state.staged[state.editing];
  if (!row) return;
  const fd = new FormData($("#edit-form"));
  const data = {
    name: String(fd.get("name") || "").trim(),
    email: String(fd.get("email") || "").trim().toLowerCase(),
    voucher: fd.get("voucher") || "",
    group: fd.get("group") || "",
    team: fd.get("team") || "",
    workRole: String(fd.get("workRole") || "").trim() || "Student",
  };
  const candidate = { ...row, ...data };
  const errors = checkStudentRow(candidate, {
    existing: db.users.filter((u) => u.type === "student"),
    batch: state.staged.map((r) => (r === row ? candidate : r)),
    directory: db,
    requireVoucher: false,
  }).filter((p) => p.level === "error");
  if (errors.length) {
    $("#edit-error").textContent = errors.map((p) => p.message).join(". ") + ".";
    return;
  }
  state.staged[state.editing] = candidate;
  persistImportDraft();
  $("#modal").close();
  state.modal = null;
  render();
  toast("Row updated");
};

// ---------- Done ----------
function toStudentInputFor(row) {
  return toStudentInput(row);
}
function importErrorsCsv(rows) {
  const cell = (value) => {
    let text = String(value ?? "");
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return csvEscape(text);
  };
  const header = ["row", "name", "email", "voucher", "admin_group", "team", "work_role", "problems"];
  const lines = rows.map((r) => [r.row, r.name, r.email, r.voucher, r.group, r.team, r.workRole, rowProblems(r).filter((p) => p.level === "error").map((p) => p.message).join("; ")].map(cell).join(","));
  return [header.join(","), ...lines].join("\r\n");
}
function importDone() {
  const counts = importCounts();
  if (!state.staged.length) return;
  if (!counts.error && !counts.needsVoucher) return commitImport();
  const sections = [];
  if (counts.needsVoucher)
    sections.push(`<section class="done-section"><h3>${pluralize(counts.needsVoucher, "student does not", "students do not")} have a voucher</h3><p>They will be added to Students, but will not be invited until a voucher is assigned.</p></section>`);
  if (counts.error)
    sections.push(`<section class="done-section"><h3>${pluralize(counts.error, "row has", "rows have")} errors and can't be added</h3><p>Fix them, or continue and leave them out. You can download them as a CSV to fix later.</p></section>`);
  const only = counts.needsVoucher && !counts.error;
  state.modal = "import-done";
  openModal(
    only ? `${pluralize(counts.needsVoucher, "student doesn't", "students don't")} have a voucher` : counts.error && !counts.needsVoucher ? `${pluralize(counts.error, "row has", "rows have")} errors and can't be added` : "Some rows need attention",
    "",
    only ? sections[0].replace(/<h3>.*?<\/h3>/, "") : sections.join(""),
    `<div class="actions">${btn("Keep reviewing", "close-modal", "text")}${counts.error ? btn("Download errors CSV", "import-download-errors") : ""}${btn(counts.error ? "Continue without them" : "Add students anyway", "import-confirm-done", "primary")}</div>`,
    "",
    true,
  );
}
function commitImport() {
  const adding = state.staged.filter((r) => importStatus(r) !== "error");
  if (!adding.length) {
    toast("There are no rows that can be added.");
    return;
  }
  let outcome;
  const draftId = state.importDraftId;
  const fileName = state.importMeta?.fileName || "CSV import";
  clearTimeout(importPersistTimer);
  const ok = dispatch((st) => {
    outcome = st.commitCsvImport(adding.map(toStudentInputFor), { fileName, excluded: state.staged.length - adding.length });
    st.discardImportDraft(draftId);
  });
  if (!ok) return;
  state.highlight = new Set(outcome.ids.map((personId) => `${personId}--student`));
  setTimeout(() => {
    state.highlight = null;
    if (state.view === "students") render();
  }, 6000);
  state.staged = [];
  state.importDraftId = null;
  state.selected = [];
  chipKey().students = "all";
  navigate("students");
  const parts = [`${pluralize(outcome.ids.length, "student")} added.`];
  parts.push(`${outcome.invited} invited.`);
  if (outcome.needsVoucher) parts.push(`${outcome.needsVoucher} ${outcome.needsVoucher === 1 ? "needs" : "need"} a voucher before they can be invited.`);
  toastWith(
    parts.join(" "),
    outcome.needsVoucher
      ? [{ label: "Show them", run: () => { chipKey().students = "needsVoucher"; state.selected = []; render(); } }]
      : [],
    outcome.needsVoucher ? 15000 : 6000,
  );
}

// ---------- Events (capture phase, so they win over the older import handlers) ----------
document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  const intercept = () => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  try {
    if (action === "csv-continue" && state.upload?.phase === "ready") {
      intercept();
      startImport(state.upload.rows, state.upload.fileName);
      if (target.dataset.chip) chipKey().import = target.dataset.chip;
      state.upload = null;
      state.importAlertDismissed = false;
      $("#modal").close();
      state.modal = null;
      navigate("import");
    } else if (action === "import-cancel") {
      intercept();
      $("#modal").open && $("#modal").close();
      state.modal = null;
      leaveImport();
    } else if (action === "fidelity-import-done") {
      intercept();
      importDone();
    } else if (action === "import-confirm-done") {
      intercept();
      $("#modal").close();
      state.modal = null;
      commitImport();
    } else if (action === "import-download-errors") {
      intercept();
      download("import-errors.csv", importErrorsCsv(state.staged.filter((r) => importStatus(r) === "error")), "text/csv");
    } else if (action === "import-discard-confirm") {
      intercept();
      state.modal = "import-discard";
      openModal("Discard this import?", state.importMeta?.fileName || "", `<p>The ${pluralize(state.staged.length, "row")} in this import will be thrown away. Nothing has been added to Students yet.</p>`, `<div class="actions">${btn("Keep reviewing", "close-modal", "text")}${btn("Discard import", "import-discard-now", "danger")}</div>`, "", true);
    } else if (action === "import-discard-now") {
      intercept();
      $("#modal").close();
      state.modal = null;
      discardImport(state.importDraftId);
      navigate("students");
      toast("Import discarded");
    } else if (action === "import-resume") {
      intercept();
      resumeImport(target.dataset.id);
    } else if (action === "import-discard") {
      intercept();
      discardImport(target.dataset.id);
      toast("Import discarded");
    } else if (action === "import-row-menu") {
      intercept();
      state.importMenu = state.importMenu === target.dataset.id ? null : target.dataset.id;
      render();
      document.querySelector(`[data-action="import-row-menu"][data-id="${target.dataset.id}"]`)?.focus();
    } else if (action === "import-remove-row") {
      intercept();
      state.importMenu = null;
      const row = state.staged.find((r) => r.id === target.dataset.id);
      if (row) runBulkFlow(importContext(), "removeFromImport", {}, [row]);
    } else if (action === "all-filters-clear") {
      chipKey()[state.view] = "all";
    } else if (state.importMenu && action !== "import-row-menu") {
      state.importMenu = null;
      if (action !== "cell-pick" && action !== "edit-import") render();
    }
  } catch (error) {
    toast(error.message);
  }
}, true);
