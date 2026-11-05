// Connects the handover layer (handover/layer/handover-layer.js) to this prototype:
// it names each screen, knows how to get back to one, and how to reveal things
// that only appear after an action, such as a dialog step or the add students panel.
// Loads last, after motion.js.
(function () {
  if (!window.HandoverLayer) return;
  const VIEW_LABELS = {
    home: "Home",
    learning: "Learning",
    finance: "Spend",
    portal: "Portal users",
    students: "Students",
    import: "CSV review",
    profile: "Person profile",
    groups: "Admin groups",
    teams: "Teams",
    team: "Team page",
    activity: "Activity",
    help: "Help & Support",
    "training-progress": "Training Progress",
    certifications: "Certifications",
    "student-requests": "Student Requests",
    "customer-organizations": "Customer Organizations",
    "internal-users": "Internal Users",
    "dashboard-configuration": "Default Dashboard Configuration",
  };
  const closeOverlays = () => {
    if (state.addPanel) closeAddPanel();
    if ($("#modal")?.open) {
      $("#modal").close();
      state.modal = null;
    }
  };
  const firstTeamWithMembers = () => teamRecords().find((t) => teamMembers(t).length) || teamRecords()[0];
  // Example people used only to show a dialog step. Nothing is saved.
  const SAMPLE_PORTAL = {
    email: "tonya.reed@northwind.example",
    name: "Tonya Reed",
    role: "Limited Admin",
    vouchers: ["Cyber Defense FY26"],
    groups: ["Federal Division"],
    teams: ["Security Operations"],
  };
  const SAMPLE_DRAFTS = [
    { id: "sample-1", email: "amara.okafor@northwind.example", name: "Amara Okafor", voucher: "Cyber Defense FY26", group: "Federal Division", team: "Security Operations", workRole: "SOC Analyst I" },
    { id: "sample-2", email: "samira.khan@example.com", name: "Samira Khan", voucher: "Cloud Security FY26", group: "", team: "Cloud Platform", workRole: "SOC Analyst I" },
  ];
  const openStudentDialog = (spec) => {
    state.drafts = spec === "students.add.entry" ? [] : SAMPLE_DRAFTS.map((d) => ({ ...d }));
    state.studentEntry = {};
    state.entryOpen = spec === "students.add.entry";
    state.reuseAssignments = false;
    state.editing = null;
    if (spec === "students.add.review") return studentReview();
    if (spec === "students.add.results") {
      state.sendResults = [
        { ...SAMPLE_DRAFTS[0], result: "sent" },
        { ...SAMPLE_DRAFTS[1], result: "account" },
      ];
      state.drafts = [];
      return renderStudentResults();
    }
    state.modal = "student-detail";
    studentForm();
  };

  HandoverLayer.init({
    project: "SANS Enterprise Portal",
    // The notes controls live in the yellow prototype bar at the top.
    toolbar: "#handover-tools",
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
      if (view === "import") {
        // The review screen needs an import in progress: use the built-in sample if there isn't one.
        if (!state.staged?.length) startImport(parseCSV(SAMPLE), "SANS-sample-students.csv");
        navigate("import");
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
      } else if (spec === "bulk-bar") {
        const ctx = bulkContext();
        if (ctx) {
          state.selected = ctx.visible.slice(0, 2).map((u) => u.id);
          render();
        }
      } else if (spec === "people.row-menu") {
        const ctx = bulkContext();
        if (ctx?.visible[0]) {
          state.rowMenu = ctx.visible[0].id;
          render();
        }
      } else if (spec === "people.remove-dialog") {
        const ctx = bulkContext();
        if (ctx?.visible[0]) openRemoveDialog([ctx.visible[0].id]);
      } else if (spec === "students.add-menu") {
        state.menu = true;
        render();
      } else if (spec.startsWith("portal.invite.")) {
        if (state.view !== "portal") navigate("portal");
        invite();
        state.portal = { ...SAMPLE_PORTAL, vouchers: [...SAMPLE_PORTAL.vouchers], groups: [...SAMPLE_PORTAL.groups], teams: [...SAMPLE_PORTAL.teams] };
        if (spec === "portal.invite.review" || spec === "portal.invite.consent") portalReview();
        else portalForm();
      } else if (spec.startsWith("students.add.")) {
        if (state.view !== "students") navigate("students");
        openStudentDialog(spec);
      } else if (spec === "csv.done-dialog") {
        if (state.view === "import") importDone();
      } else if (spec === "csv.summary") {
        stageCSV(SAMPLE, "SANS-sample-students.csv");
      } else if (spec.startsWith("csv.") && !spec.startsWith("csv.review")) {
        uploadForm();
      }
    },
  });
})();
