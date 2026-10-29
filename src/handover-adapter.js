// Connects the handover layer (handover/layer/handover-layer.js) to this prototype:
// it names each screen, knows how to get back to one, and how to reveal things
// that only appear after an action, such as the add students panel.
// Loads last, after motion.js.
(function () {
  if (!window.HandoverLayer) return;
  const VIEW_LABELS = {
    home: "Home",
    learning: "Learning",
    finance: "Account & Finance",
    portal: "Portal users",
    students: "Students",
    import: "CSV review",
    profile: "Person profile",
    groups: "Admin groups",
    teams: "Teams",
    team: "Team page",
    activity: "Activity",
    help: "Help & Support",
  };
  const closeOverlays = () => {
    if (state.addPanel) closeAddPanel();
    if ($("#modal")?.open) {
      $("#modal").close();
      state.modal = null;
    }
  };
  const firstTeamWithMembers = () =>
    teamRecords().find((t) => teamMembers(t).length) || teamRecords()[0];

  HandoverLayer.init({
    project: "SANS Enterprise Portal",
    data: window.__HANDOVER_DATA__ || null,
    // The local server (serve.py) saves notes. Static hosting has no endpoint, so it is read-only.
    endpoint: location.protocol.startsWith("http") ? "/__handover/data" : null,
    getView() {
      if (state.view === "teams" && state.teamId) return "team";
      return state.view;
    },
    viewLabel(view) {
      return VIEW_LABELS[view] || view;
    },
    goTo(view) {
      closeOverlays();
      if (view === "team") {
        const team = (state.teamId && teamById(state.teamId)) || firstTeamWithMembers();
        if (team) openTeam(team.id);
        return;
      }
      if (view === "teams") state.teamId = null;
      navigate(view);
    },
    reveal(anchor) {
      const spec = anchor.spec || "";
      if (spec === "teams.add-panel") {
        const team = (state.teamId && teamById(state.teamId)) || firstTeamWithMembers();
        if (state.view !== "teams" || !state.teamId) openTeam(team.id);
        openAddPanel(team.id);
      } else if (spec === "teams.delete-dialog") {
        openDeleteTeam(firstTeamWithMembers().id);
      } else if (spec === "teams.bulk-bar") {
        state.teamSel = teamRecords().slice(0, 2).map((t) => t.id);
        render();
      } else if (spec === "bulk-bar" && state.view === "teams" && state.teamId) {
        state.selected = teamMembers(currentTeam()).slice(0, 2).map((u) => u.id);
        render();
      } else if (spec === "csv.summary") {
        stageCSV(SAMPLE, "SANS-sample-students.csv");
      } else if (spec.startsWith("csv.")) {
        uploadForm();
      }
    },
  });
})();
