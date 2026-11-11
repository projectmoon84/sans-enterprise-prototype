// Global Activity page: every event across the organisation, filterable and
// exportable. Loads last. Entries reuse the profile's entry markup.

var ACTIVITY_PAGE_SIZE = 25;
var activityPage;

function activityPageState() {
  if (!activityPage)
    activityPage = {
      personId: "",
      category: "",
      from: "",
      to: "",
      adminGroupId: "",
      voucherId: "",
      shown: ACTIVITY_PAGE_SIZE,
      open: [],
    };
  return activityPage;
}

function activityPageContext() {
  const snapshot = store.snapshot();
  const viewer = snapshot.people.find((p) => p.id === snapshot.session.actorId);
  const visible = visibleEvents(snapshot.events, snapshot, viewer);
  const filters = activityPageState();
  const matching = filterEvents(visible, snapshot, filters);
  return { snapshot, viewer, visible, matching, filters };
}

function activityOptions(items, selected, blank) {
  return `<option value="">${esc(blank)}</option>${items
    .map(
      ([value, label]) =>
        `<option value="${esc(value)}"${value === selected ? " selected" : ""}>${esc(label)}</option>`,
    )
    .join("")}`;
}

function activityBatchEntry(batch, open) {
  const first = batch.events[0];
  const via = viaLabel(first);
  const id = `batch-${batch.batchId}`;
  const members = batch.events.filter((event) => event.action !== "import.completed");
  return `<li class="activity-entry activity-batch-entry${open ? " open" : ""}" data-batch-id="${esc(batch.batchId)}"><div class="activity-line"><time datetime="${esc(first.at)}">${esc(timeLabel(first.at))}</time><p class="activity-text">${batchHeadline(batch)}${via ? ` <span class="activity-via">via ${esc(via)}</span>` : ""} <span class="activity-count">${members.length} events</span></p><button type="button" class="activity-expand" data-action="activity-page-toggle" data-id="${esc(batch.batchId)}" aria-expanded="${open}" aria-controls="${esc(id)}" aria-label="${open ? "Hide" : "Show"} the ${members.length} events in this ${first.via === "csv" ? "import" : "bulk action"}">${icon("chevron")}</button></div><div class="activity-details" id="${esc(id)}"${open ? "" : " hidden"}><ul class="activity-batch-list" aria-label="Events in this ${first.via === "csv" ? "import" : "bulk action"}">${members
    .map((event) => `<li><time datetime="${esc(event.at)}">${esc(timeLabel(event.at))}</time><span>${describeEvent(event)}</span></li>`)
    .join("")}</ul></div></li>`;
}

function activityPageView() {
  const { snapshot, visible, matching, filters } = activityPageContext();
  const shown = matching.slice(0, filters.shown);
  // Batches are grouped after paging, so a batch is never split across "Show more".
  const entries = groupBatches(shown);
  const days = [];
  for (const entry of entries) {
    const at = entry.type === "batch" ? entry.events[0].at : entry.event.at;
    const label = dayLabel(at);
    if (days.at(-1)?.label !== label) days.push({ label, entries: [] });
    days.at(-1).entries.push(entry);
  }
  const people = [...snapshot.people].sort((a, b) => a.name.localeCompare(b.name));
  const active = Object.entries(filters).some(
    ([key, value]) => !["shown", "open"].includes(key) && value,
  );
  const remaining = matching.length - shown.length;
  const status = `Showing ${shown.length} of ${matching.length} ${matching.length === 1 ? "event" : "events"}${matching.length !== visible.length ? ` (filtered from ${visible.length})` : ""}`;
  const exportButton = btn(
    icon("download") + "Export CSV",
    "activity-page-export",
    "",
    matching.length ? "" : "disabled",
  );
  return `${heading("Activity", "Everything that has changed across your organization.", exportButton)}
  <section class="card activity-page" aria-label="Activity Log">
    <form class="activity-filters" id="activity-filters" role="search" aria-label="Filter activity" onsubmit="return false">
      <div class="field"><label for="activity-person">Person</label><select id="activity-person" data-activity-filter="personId">${activityOptions(people.map((p) => [p.id, p.name]), filters.personId, "Everyone")}</select></div>
      <div class="field"><label for="activity-category">Type of Action</label><select id="activity-category" data-activity-filter="category">${activityOptions([...ACTION_CATEGORIES.map((c) => [c.key, c.label]), ["other", "Other"]], filters.category, "All Actions")}</select></div>
      <div class="field"><label for="activity-voucher">Voucher</label><select id="activity-voucher" data-activity-filter="voucherId">${activityOptions(snapshot.vouchers.map((v) => [v.id, v.name]), filters.voucherId, "All Vouchers")}</select></div>
      <div class="field"><label for="activity-group">Admin Group</label><select id="activity-group" data-activity-filter="adminGroupId">${activityOptions(snapshot.adminGroups.map((g) => [g.id, g.name]), filters.adminGroupId, "All Admin Groups")}</select></div>
      <div class="field"><label for="activity-from">From</label><input type="date" id="activity-from" data-activity-filter="from" value="${esc(filters.from)}" max="${esc(filters.to)}"></div>
      <div class="field"><label for="activity-to">To</label><input type="date" id="activity-to" data-activity-filter="to" value="${esc(filters.to)}" min="${esc(filters.from)}"></div>
      ${active ? btn("Clear Filters", "activity-page-clear", "text") : ""}
    </form>
    <p class="activity-summary" role="status">${esc(status)}</p>
    ${
      days.length
        ? days
            .map(
              (day) =>
                `<section class="activity-day"><h2>${esc(day.label)}</h2><ul aria-label="Activity on ${esc(day.label)}">${day.entries
                  .map((entry) =>
                    entry.type === "batch"
                      ? activityBatchEntry(entry, filters.open.includes(entry.batchId))
                      : activityEntryHtml(entry.event, matching, filters.open.includes(entry.event.id), "activity-page-toggle"),
                  )
                  .join("")}</ul></section>`,
            )
            .join("")
        : `<div class="profile-empty activity-empty">${icon("schedule")}<h2>No Activity Found</h2><p>${active ? "Try widening the date range or clearing a filter." : "Changes will appear here as people use the portal."}</p>${active ? btn("Clear Filters", "activity-page-clear") : ""}</div>`
    }
    ${remaining > 0 ? `<div class="activity-more">${btn(`Show More (${remaining})`, "activity-page-more", "small")}</div>` : ""}
  </section>`;
}

const activityBaseContent = content;
content = function () {
  return state.view === "activity" ? activityPageView() : activityBaseContent();
};

function activityPageRefocus(selector) {
  render();
  document.querySelector(selector)?.focus();
}

document.addEventListener("change", (event) => {
  const key = event.target.dataset?.activityFilter;
  if (!key || state.view !== "activity") return;
  const filters = activityPageState();
  filters[key] = event.target.value;
  filters.shown = ACTIVITY_PAGE_SIZE;
  filters.open = [];
  activityPageRefocus(`#${event.target.id}`);
});

document.addEventListener("click", (event) => {
  if (state.view !== "activity") return;
  const entry = event.target.closest(".activity-page .activity-entry");
  const filters = activityPageState();
  const toggle = (id) => {
    const index = filters.open.indexOf(id);
    if (index < 0) filters.open.push(id);
    else filters.open.splice(index, 1);
    activityPageRefocus(`.activity-expand[data-id="${id}"]`);
  };
  if (entry && !event.target.closest("a,button,input,select,textarea")) {
    toggle(entry.dataset.batchId || entry.dataset.eventId);
    return;
  }
  const target = event.target.closest("[data-action]");
  const action = target?.dataset.action;
  if (!action?.startsWith("activity-page-")) return;
  event.preventDefault();
  if (action === "activity-page-toggle") toggle(target.dataset.id);
  if (action === "activity-page-more") {
    filters.shown += ACTIVITY_PAGE_SIZE;
    activityPageRefocus('[data-action="activity-page-more"]');
  }
  if (action === "activity-page-clear") {
    Object.assign(filters, { personId: "", category: "", from: "", to: "", adminGroupId: "", voucherId: "", shown: ACTIVITY_PAGE_SIZE, open: [] });
    activityPageRefocus("#activity-person");
  }
  if (action === "activity-page-export") {
    const { matching } = activityPageContext();
    download(
      `sans-activity-${new Date().toISOString().slice(0, 10)}.csv`,
      eventsToCsv(matching),
      "text/csv",
    );
    toast(`Exported ${matching.length} ${matching.length === 1 ? "event" : "events"}`);
  }
});
