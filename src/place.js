// ---------- Place: the page you're on survives a refresh ----------
// The current page lives in the address (#/students, #/teams/<id>/history, #/profile/<id>) and is read back when
// the prototype loads, or when someone edits the address. Only places that can be rebuilt from saved data are
// kept; a CSV import in progress can't be, so it falls back to the default page.
// Loads after internal-users.js and before motion.js, so the first load still gets its entrance.

function placeHash() {
  if (state.view === "import") return "";
  if (state.view === "teams" && state.teamId) return `#/teams/${encodeURIComponent(state.teamId)}/${state.teamTab || "members"}`;
  if (state.view === "profile" && state.profileId) return `#/profile/${encodeURIComponent(state.profileId)}`;
  return `#/${state.view}`;
}

function restorePlace() {
  const [view, id, tab] = location.hash
    .replace(/^#\/?/, "")
    .split("/")
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return "";
      }
    });
  if (!view || view === "import") return false;
  if (view === "teams") {
    teamsState();
    state.teamId = id && teamById(id) ? id : null;
    if (state.teamId) state.teamTab = TEAM_TABS.includes(tab) ? tab : "members";
    state.view = "teams";
    return true;
  }
  if (view === "profile") {
    const person = db.users.find((u) => u.id === id);
    if (!person) return false;
    state.profileId = id;
    state.profileFrom = person.type === "portal" ? "portal" : "students";
    state.view = "profile";
    return true;
  }
  // Any page the sidebar links to.
  if (document.querySelector(`[data-view="${CSS.escape(view)}"]`)) {
    state.view = view;
    return true;
  }
  return false;
}

const placeBaseRender = render;
render = function (...args) {
  const result = placeBaseRender(...args);
  const hash = placeHash();
  if (hash !== location.hash && (hash || location.hash)) history.replaceState(null, "", hash || location.pathname + location.search);
  return result;
};

if (restorePlace()) render();
addEventListener("hashchange", () => {
  if (restorePlace()) render();
});
