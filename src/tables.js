// Table behaviour — loaded last.
// 1. Name + checkbox columns are frozen while the rest scrolls sideways; the ⋮ menu column is frozen on the right.
// 2. The header row sticks under the top bar while the page scrolls (it lives in its own table, kept in step sideways).
// 3. Right-click a row to open its ⋮ menu at the pointer.
// 4. Left-click a row to open that person's profile page (placeholder until it is specced).

const TOPBAR = 80; // 60px top bar + 20px prototype bar
Object.assign(state, {
  profileId: null,
  profileFrom: "portal",
  menuAt: null,
  tableScroll: {},
});

// ---------- Split each main table into a sticky header + scrolling body ----------
function enhanceTables() {
  document
    .querySelectorAll(
      "#main .people-card .table-wrap, #main .import-card .table-wrap",
    )
    .forEach((wrap) => {
      const table = wrap.querySelector("table");
      if (!table || !table.tHead) return;
      const head = document.createElement("div");
      head.className = "table-sticky-head";
      const headTable = document.createElement("table");
      headTable.className = table.className + " head-table";
      const cols = table.querySelector("colgroup");
      if (cols) headTable.appendChild(cols.cloneNode(true));
      headTable.appendChild(table.tHead);
      head.appendChild(headTable);
      wrap.classList.add("has-sticky-head");
      wrap.before(head);
      const key = state.view;
      const sync = () => {
        head.scrollLeft = wrap.scrollLeft;
        const max = wrap.scrollWidth - wrap.clientWidth;
        for (const el of [wrap, head]) {
          el.classList.toggle("is-scrolled", wrap.scrollLeft > 0);
          el.classList.toggle("has-more", wrap.scrollLeft < max - 1);
        }
        state.tableScroll[key] = wrap.scrollLeft;
      };
      wrap.addEventListener(
        "scroll",
        () => {
          const prev = state.tableScroll[key] || 0;
          sync();
          if (Math.abs(wrap.scrollLeft - prev) > 2) closeRowMenuOnScroll();
        },
        { passive: true },
      );
      head.addEventListener(
        "wheel",
        (e) => {
          if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
            wrap.scrollLeft += e.deltaX;
            e.preventDefault();
          }
        },
        { passive: false },
      );
      wrap.scrollLeft = state.tableScroll[key] || 0;
      sync();
    });
  markStuckHeads();
}
function markStuckHeads() {
  document
    .querySelectorAll(".table-sticky-head")
    .forEach((h) =>
      h.classList.toggle(
        "is-stuck",
        h.getBoundingClientRect().top <= TOPBAR + 0.5,
      ),
    );
}
let menuScrollY = 0;
window.addEventListener(
  "scroll",
  () => {
    markStuckHeads();
    if (Math.abs(scrollY - menuScrollY) > 4) closeRowMenuOnScroll();
  },
  { passive: true },
);
window.addEventListener("resize", () => {
  document
    .querySelectorAll(".has-sticky-head")
    .forEach((w) => w.dispatchEvent(new Event("scroll")));
});

// ---------- Row ⋮ menu: fixed-position so it is never clipped by the scrolling table ----------
function placeRowMenu() {
  const menu = document.querySelector("#main .row-dropdown");
  if (!menu) return;
  menuScrollY = scrollY;
  const w = menu.offsetWidth,
    h = menu.offsetHeight,
    pad = 8;
  let x, y;
  if (state.menuAt) {
    x = state.menuAt.x;
    y = state.menuAt.y;
  } else {
    const r = menu
      .closest(".menu-anchor")
      .querySelector(".kebab")
      .getBoundingClientRect();
    x = r.right - w;
    y = r.bottom + 4;
  }
  x = Math.max(pad, Math.min(x, innerWidth - w - pad));
  if (y + h > innerHeight - pad)
    y = Math.max(
      TOPBAR + pad,
      (state.menuAt ? state.menuAt.y : y - 40) - h - 4,
    );
  Object.assign(menu.style, {
    position: "fixed",
    left: x + "px",
    top: y + "px",
    right: "auto",
  });
  // Lift the menu out of the frozen cell so neighbouring frozen columns can't paint over it.
  const host = document.createElement("div");
  host.className = "menu-anchor floating-menu-host";
  document.body.appendChild(host);
  host.appendChild(menu);
}
function closeRowMenuOnScroll() {
  menuScrollY = scrollY;
  if (state.rowMenu) {
    state.rowMenu = null;
    state.menuAt = null;
    render();
  }
}

// ---------- Profile page (placeholder) ----------
function profileView() {
  const u = db.users.find((x) => x.id === state.profileId);
  const from = state.profileFrom === "students" ? "students" : "portal";
  if (!u)
    return `<button class="back" data-action="navigate" data-view="${from}">${icon("back")}Back</button>${heading("Person not found", "This record may have been deleted.")}`;
  const portal = u.type === "portal",
    other = linkedPerson(u.email, otherType(u.type));
  const rows = portal
    ? [
        ["Email", u.email],
        ["Role", u.role],
        ["Status", labelStatus(u.status), true],
        ["Voucher Access", u.vouchers.join(", ") || "None"],
        ["Admin Groups", u.groups.join(", ") || "None"],
        ["Team Access", u.teams.join(", ") || "None"],
      ]
    : [
        ["Email", u.email],
        ["Work Role", u.workRole || "—"],
        ["Status", labelStatus(u.status), true],
        ["Voucher", u.vouchers[0] || "None"],
        ["Admin Group", u.groups[0] || "Unassigned"],
        ["Team", u.teams[0] || "Unassigned"],
      ];
  if (u.accountSetup && u.status === "Pending invite")
    rows.push(["SANS account", "Awaiting Account Creation"]);
  return `<button class="back" data-action="navigate" data-view="${from}">${icon("back")}Back to ${from === "portal" ? "Portal Users" : "Students"}</button>
 <div class="page-head profile-head"><div class="profile-title"><span class="profile-avatar">${esc(initial(u.name || u.email))}</span><div><p class="eyebrow">${portal ? "Portal User" : "Student"}</p><h1>${esc(u.name || u.email)}</h1><p class="muted">${esc(portal ? u.role : u.workRole || "Student")} · ${esc(u.email)}</p></div></div><div class="head-actions">${btn(icon("edit") + "Edit Details", "edit-user", "", 'data-id="' + esc(u.id) + '"')}</div></div>
 <div class="note profile-placeholder">${icon("info")}<span>Profile page placeholder. The full profile is still to be specced. This shows the record’s current details.</span></div>
 <div class="profile-grid"><section class="card"><h2>Details</h2><dl class="profile-details">${rows.map(([l, v, html]) => `<div><dt>${l}</dt><dd>${html ? v : esc(v)}</dd></div>`).join("")}</dl></section>
 <section class="card"><h2>Roles</h2>${other ? `<p>${esc(u.name)} is also ${other.type === "student" ? "a <strong>student</strong>" : "a <strong>portal user</strong>"}.</p>${btn((other.type === "student" ? "View Student Profile" : "View Portal User Profile") + icon("arrow"), "open-profile", "", 'data-id="' + esc(other.id) + '"')}` : `<p class="muted">${portal ? "Not a student." : "Not a portal user."}</p>${btn(portal ? "Add as Student" : "Invite as Portal User", portal ? "add-as-student" : "invite-as-portal", "", 'data-id="' + esc(u.id) + '"')}`}</section></div>`;
}
function openProfile(id) {
  const u = db.users.find((x) => x.id === id);
  if (!u) return;
  state.profileId = id;
  state.profileFrom = u.type === "portal" ? "portal" : "students";
  navigate("profile");
  window.scrollTo(0, 0);
}

const tablesBaseContent = content;
content = function () {
  return state.view === "profile" ? profileView() : tablesBaseContent();
};
const tablesBaseRender = render;
render = function () {
  document.querySelectorAll(".floating-menu-host").forEach((h) => h.remove());
  tablesBaseRender();
  enhanceTables();
  if (state.view === "profile")
    document
      .querySelector(
        `.nav-btn[data-view="${state.profileFrom === "students" ? "students" : "portal"}"]`,
      )
      ?.classList.add("active");
  placeRowMenu();
};

// ---------- Row interactions ----------
const INTERACTIVE =
  "input,button,a,label,select,textarea,.menu-anchor,.role-tag";
function rowId(tr) {
  return tr?.querySelector("input[data-select]")?.dataset.select;
}
document.addEventListener(
  "click",
  (e) => {
    const t = e.target.closest("[data-action]");
    if (t?.dataset.action === "open-event-person") {
      e.stopImmediatePropagation();
      const row =
        db.users.find(
          (user) =>
            user.personId === t.dataset.personId && user.type === "portal",
        ) || db.users.find((user) => user.personId === t.dataset.personId);
      if (row) openProfile(row.id);
      return;
    }
    if (t?.dataset.action === "row-menu") state.menuAt = null;
    if (t?.dataset.action === "open-profile") {
      e.stopImmediatePropagation();
      openProfile(t.dataset.id);
      return;
    }
    const tr = e.target.closest("#main .people-table tbody tr");
    if (!tr || e.target.closest(INTERACTIVE) || getSelection().toString())
      return;
    const id = rowId(tr);
    if (!id) return;
    if (state.rowMenu) {
      state.rowMenu = null;
      state.menuAt = null;
    }
    openProfile(id);
  },
  true,
);
document.addEventListener("contextmenu", (e) => {
  const tr = e.target.closest(
    "#main .people-table tbody tr, #main .csv-review-table tbody tr",
  );
  if (!tr) return;
  const kebab = tr.querySelector(".kebab");
  if (!kebab) return;
  e.preventDefault();
  if (tr.closest(".csv-review-table")) {
    kebab.click();
    return;
  } // import rows: the ⋮ opens the correction dialog
  const id = rowId(tr);
  if (!id) return;
  state.rowMenu = id;
  state.menuAt = { x: e.clientX, y: e.clientY };
  state.actionsOpen = false;
  state.profileOpen = false;
  render();
  document
    .querySelector("#main .row-dropdown button")
    ?.focus({ preventScroll: true });
});
// Keyboard: Enter on a focused row opens the profile.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const tr = e.target.closest?.("#main .people-table tbody tr");
  if (tr && e.target === tr) {
    openProfile(rowId(tr));
  }
});
const tablesRowAttr = new MutationObserver(() =>
  document.querySelectorAll("#main .people-table tbody tr").forEach((tr) => {
    if (rowId(tr) && !tr.hasAttribute("tabindex")) {
      tr.tabIndex = 0;
      tr.classList.add("clickable-row");
      tr.title = "Open Profile";
    }
  }),
);
tablesRowAttr.observe(document.getElementById("app"), {
  childList: true,
  subtree: true,
});

render();
