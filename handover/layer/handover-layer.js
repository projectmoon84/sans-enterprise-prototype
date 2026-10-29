/*
 * Handover layer
 * A switchable overlay for annotating a working prototype, ready for developer handover.
 * No dependencies. Drop it into any prototype and call HandoverLayer.init({...}).
 *
 * Notes attach to components marked with data-spec="area.component" (and an optional
 * data-spec-label), so they follow the component when the layout changes. Elements
 * without a data-spec fall back to a CSS selector, or to the page.
 *
 * Editing works when an endpoint can save the data file (the local dev server).
 * On static hosting the layer is read-only and shows the embedded data.
 */
(function () {
  "use strict";
  if (window.HandoverLayer) return;

  var KINDS = [
    { key: "feature", label: "New feature", hue: "#0e7490" },
    { key: "change", label: "Change", hue: "#7c3aed" },
    { key: "global", label: "Global change", hue: "#b45309" },
    { key: "fix", label: "Fix", hue: "#15803d" },
  ];
  var PROFILE_KEY = "handover-layer-profile";
  var BACKUP_KEY = "handover-layer-backup";

  var cfg = {};
  var data = { version: 1, project: "", nextRef: 1, handovers: [], notes: [] };
  var editable = false;
  var on = false;
  var picking = false;
  var panelOpen = false;
  var filter = { handover: "next", kind: "all" };
  var focusRef = null;
  var captureRef = null;
  var root, shadow, els = {};
  var hoverEl = null;
  var raf = 0;

  // ---------- Small helpers ----------
  function h(tag, attrs, html) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) el.setAttribute(k, attrs[k]);
    if (html != null) el.innerHTML = html;
    return el;
  }
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // A small, safe subset of Markdown: paragraphs, "- " bullets, **bold**, `code`.
  function md(text) {
    var blocks = String(text || "").trim().split(/\n{2,}/);
    return blocks
      .map(function (block) {
        var lines = block.split("\n");
        var inline = function (s) {
          return esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`(.+?)`/g, "<code>$1</code>");
        };
        if (lines.every(function (l) { return /^\s*[-*] /.test(l); }))
          return "<ul>" + lines.map(function (l) { return "<li>" + inline(l.replace(/^\s*[-*] /, "")) + "</li>"; }).join("") + "</ul>";
        return "<p>" + lines.map(inline).join("<br>") + "</p>";
      })
      .join("");
  }
  function kindOf(key) {
    return KINDS.find(function (k) { return k.key === key; }) || KINDS[0];
  }
  function today() {
    return new Date().toISOString().slice(0, 10);
  }
  function profile() {
    try {
      return JSON.parse(localStorage.getItem(PROFILE_KEY) || "null");
    } catch (e) {
      return null;
    }
  }
  function saveProfile(p) {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
    } catch (e) {}
  }
  function humanise(spec) {
    var last = String(spec || "").split(".").pop() || "";
    last = last.replace(/[-_]+/g, " ");
    return last.charAt(0).toUpperCase() + last.slice(1);
  }
  function currentView() {
    try {
      return cfg.getView ? cfg.getView() : location.pathname + location.hash;
    } catch (e) {
      return "";
    }
  }
  function viewLabel(view) {
    try {
      return (cfg.viewLabel && cfg.viewLabel(view)) || view || "Anywhere";
    } catch (e) {
      return view || "Anywhere";
    }
  }
  function handoverName(id) {
    if (!id) return "Next handover";
    var ho = data.handovers.find(function (x) { return x.id === id; });
    return ho ? ho.name : id;
  }

  // ---------- Anchors ----------
  function selectorFor(el) {
    if (!el || el === document.body) return "";
    if (el.id && !/^\d/.test(el.id)) return "#" + CSS.escape(el.id);
    var parts = [];
    var node = el;
    for (var depth = 0; node && node !== document.body && depth < 5; depth++) {
      var part = node.tagName.toLowerCase();
      var cls = [].slice.call(node.classList).filter(function (c) { return !/^(is-|has-|active|open|motion)/.test(c); }).slice(0, 2);
      if (cls.length) part += "." + cls.map(CSS.escape).join(".");
      var parent = node.parentElement;
      if (parent) {
        var same = [].slice.call(parent.children).filter(function (c) { return c.tagName === node.tagName; });
        if (same.length > 1) part += ":nth-of-type(" + (same.indexOf(node) + 1) + ")";
      }
      parts.unshift(part);
      if (node.id) break;
      node = parent;
    }
    return parts.join(" > ");
  }
  function anchorFrom(el) {
    var spec = el && el.closest ? el.closest("[data-spec]") : null;
    if (spec)
      return { view: currentView(), spec: spec.getAttribute("data-spec"), label: spec.getAttribute("data-spec-label") || humanise(spec.getAttribute("data-spec")) };
    var selector = selectorFor(el);
    return { view: currentView(), selector: selector, label: selector ? "Page area" : "Page" };
  }
  function findAnchor(anchor) {
    if (!anchor) return null;
    var el = null;
    if (anchor.spec) el = document.querySelector('[data-spec="' + CSS.escape(anchor.spec) + '"]');
    else if (anchor.selector) {
      try {
        el = document.querySelector(anchor.selector);
      } catch (e) {}
    }
    if (!el || root.contains(el)) return null;
    var r = el.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return el;
  }
  function onThisView(note) {
    if (!note.anchor || !note.anchor.view) return note.kind === "global" && !note.anchor;
    return note.anchor.view === currentView();
  }
  function whereText(note) {
    if (!note.anchor) return "Applies everywhere";
    return viewLabel(note.anchor.view) + (note.anchor.label && note.anchor.label !== "Page" ? " › " + note.anchor.label : "");
  }

  // ---------- Data ----------
  function visibleNotes() {
    return data.notes
      .filter(function (n) {
        if (filter.handover === "next" && n.handover) return false;
        if (filter.handover !== "next" && filter.handover !== "all" && n.handover !== filter.handover) return false;
        if (filter.kind !== "all" && n.kind !== filter.kind) return false;
        return true;
      })
      .sort(function (a, b) { return a.ref - b.ref; });
  }
  function persist() {
    try {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(data));
    } catch (e) {}
    if (!editable || !cfg.endpoint) return Promise.resolve(false);
    return fetch(cfg.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data, null, 2) })
      .then(function (r) {
        if (!r.ok) throw new Error("save failed");
        return true;
      })
      .catch(function () {
        toast("Couldn't save to the project file. Your change is kept in this browser.");
        return false;
      });
  }
  function load() {
    var embedded = cfg.data && typeof cfg.data === "object" ? cfg.data : null;
    if (embedded) data = normalise(embedded);
    if (!cfg.endpoint) return Promise.resolve();
    return fetch(cfg.endpoint, { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("no endpoint");
        return r.json();
      })
      .then(function (json) {
        data = normalise(json);
        editable = true;
      })
      .catch(function () {
        editable = false;
      });
  }
  function normalise(d) {
    var out = {
      version: 1,
      project: d.project || cfg.project || "",
      nextRef: d.nextRef || 1,
      handovers: Array.isArray(d.handovers) ? d.handovers : [],
      notes: Array.isArray(d.notes) ? d.notes : [],
    };
    out.notes.forEach(function (n) {
      out.nextRef = Math.max(out.nextRef, (n.ref || 0) + 1);
    });
    return out;
  }

  // ---------- Rendering ----------
  var CSS_TEXT =
    ":host{all:initial}*{box-sizing:border-box}[hidden]{display:none!important}" +
    ".hl{font:14px/1.45 'Fira Sans',system-ui,-apple-system,'Segoe UI',sans-serif;color:#0f172b}" +
    ".overlay{position:fixed;inset:0;pointer-events:none;z-index:2147483000}" +
    ".box{position:fixed;border:2px solid var(--c,#0e7490);border-radius:8px;background:color-mix(in srgb,var(--c,#0e7490) 7%,transparent);pointer-events:none;transition:all .08s}" +
    ".box-label{position:absolute;left:18px;top:-24px;background:var(--c,#0e7490);color:#fff;font-size:12px;font-weight:500;padding:2px 8px;border-radius:6px 6px 6px 0;white-space:nowrap}" +
    ".pin{position:fixed;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50% 50% 50% 4px;background:var(--c);color:#fff;font-size:12px;font-weight:600;display:grid;place-items:center;pointer-events:auto;cursor:pointer;border:2px solid #fff;box-shadow:0 2px 8px rgba(15,23,43,.3);transition:transform .12s}" +
    ".pin:hover,.pin.is-focus{transform:scale(1.15)}.pin:focus-visible{outline:2px solid #0f172b;outline-offset:2px}" +
    ".bar{position:fixed;left:16px;bottom:16px;z-index:2147483001;display:flex;align-items:center;gap:4px;padding:4px;border-radius:999px;background:#0f172b;color:#fff;box-shadow:0 8px 24px rgba(15,23,43,.3);pointer-events:auto}" +
    ".bar button{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:999px;font:500 13px/1 'Fira Sans',system-ui,sans-serif;color:#e2e8f0;white-space:nowrap}" +
    ".bar button:hover{background:#1e293b}.bar button:focus-visible{outline:2px solid #67e8f9;outline-offset:1px}" +
    ".bar button[aria-pressed=true]{background:#e0f2fe;color:#0f172b}" +
    ".bar .count{background:#334155;color:#fff;border-radius:999px;padding:2px 7px;font-size:11px}" +
    ".bar button[aria-pressed=true] .count{background:#0e7490}" +
    ".bar .sep{width:1px;height:20px;background:#334155;margin:0 2px}" +
    ".hint{position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:2147483001;background:#0f172b;color:#fff;padding:9px 14px;border-radius:10px;font-size:13px;box-shadow:0 8px 24px rgba(15,23,43,.3);pointer-events:none}" +
    ".panel{position:fixed;top:0;right:0;bottom:0;width:min(400px,100vw);z-index:2147483001;background:#fff;box-shadow:-12px 0 32px rgba(15,23,43,.18);display:flex;flex-direction:column;pointer-events:auto}" +
    ".panel header{padding:18px 20px 12px;border-bottom:1px solid #e2e8f0}" +
    ".panel h2{margin:0;font-size:18px;font-weight:600}.panel .sub{margin:2px 0 0;color:#64748b;font-size:13px}" +
    ".row{display:flex;align-items:center;gap:8px}.sp{flex:1}" +
    ".x{all:unset;cursor:pointer;width:32px;height:32px;display:grid;place-items:center;border-radius:8px;color:#475569;font-size:18px}.x:hover{background:#f1f5f9}.x:focus-visible{outline:2px solid #0e7490}" +
    ".filters{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}" +
    "select,input,textarea{font:inherit;color:inherit}" +
    ".filters select{border:1px solid #cbd5e1;border-radius:8px;padding:5px 8px;font-size:13px;background:#fff}" +
    ".chip{all:unset;cursor:pointer;font-size:12px;padding:4px 10px;border-radius:999px;border:1px solid #cbd5e1;color:#334155}" +
    ".chip[aria-pressed=true]{border-color:#0e7490;background:#ecfeff;color:#0e7490;font-weight:500}.chip:focus-visible{outline:2px solid #0e7490}" +
    ".list{flex:1;overflow-y:auto;padding:8px 12px 24px}" +
    ".group{margin:14px 8px 6px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#64748b}" +
    ".note{display:block;width:100%;text-align:left;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;margin:0 0 8px;background:#fff;cursor:pointer;font:inherit;color:inherit}" +
    ".note:hover{border-color:#94a3b8}.note.is-focus{border-color:#0e7490;box-shadow:0 0 0 1px #0e7490}.note:focus-visible{outline:2px solid #0e7490}" +
    ".note .top{display:flex;align-items:center;gap:8px}" +
    ".ref{font:600 12px/1 ui-monospace,Menlo,monospace;color:#475569}" +
    ".kind{font-size:11px;font-weight:500;padding:2px 8px;border-radius:999px;color:var(--c);background:color-mix(in srgb,var(--c) 12%,#fff)}" +
    ".note h3{margin:6px 0 2px;font-size:14.5px;font-weight:600}" +
    ".where{font-size:12px;color:#64748b}" +
    ".body{font-size:13.5px;color:#334155;margin-top:6px}.body p{margin:0 0 6px}.body ul{margin:0 0 6px;padding-left:18px}.body code{font:12px ui-monospace,Menlo,monospace;background:#f1f5f9;padding:1px 4px;border-radius:4px}" +
    ".note:not(.is-focus) .body{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}" +
    ".meta{display:flex;flex-wrap:wrap;gap:6px 12px;margin-top:8px;font-size:12px;color:#64748b}" +
    ".actions{display:flex;gap:6px;margin-top:10px}" +
    ".btn{all:unset;cursor:pointer;font:500 13px/1 'Fira Sans',system-ui,sans-serif;padding:8px 12px;border-radius:999px;border:1px solid #cbd5e1;color:#0f172b;background:#fff;display:inline-flex;align-items:center;gap:6px}" +
    ".btn:hover{background:#f8fafc}.btn:focus-visible{outline:2px solid #0e7490;outline-offset:1px}" +
    ".btn.pri{background:#0e7490;border-color:#0e7490;color:#fff}.btn.pri:hover{background:#155e75}" +
    ".btn.danger{color:#b91c1c;border-color:#fecaca}.btn.small{padding:6px 10px;font-size:12px}" +
    ".btn[disabled]{opacity:.5;pointer-events:none}" +
    ".empty{padding:32px 16px;text-align:center;color:#64748b;font-size:13.5px}" +
    ".readonly{margin:10px 0 0;padding:8px 10px;border-radius:8px;background:#f8fafc;color:#475569;font-size:12.5px}" +
    ".foot{padding:12px 20px;border-top:1px solid #e2e8f0;display:flex;gap:8px;flex-wrap:wrap}" +
    ".scrim{position:fixed;inset:0;background:rgba(15,23,43,.35);z-index:2147483002;display:grid;place-items:center;pointer-events:auto;padding:16px}" +
    ".dialog{width:min(520px,100%);max-height:calc(100vh - 32px);overflow:auto;background:#fff;border-radius:16px;box-shadow:0 24px 48px rgba(15,23,43,.25);padding:22px 24px}" +
    ".dialog h2{margin:0 0 4px;font-size:19px;font-weight:600}" +
    ".field{display:grid;gap:6px;margin-top:14px}.field label{font-size:13px;font-weight:500}.field .help{font-size:12px;color:#64748b}" +
    ".field input:not([type=radio]),.field textarea,.field select{border:1px solid #cbd5e1;border-radius:10px;padding:9px 11px;font-size:14px;background:#fff;width:100%}" +
    ".field textarea{min-height:120px;resize:vertical}" +
    ".field input:focus,.field textarea:focus,.field select:focus{outline:2px solid #0e7490;outline-offset:0;border-color:#0e7490}" +
    ".kinds{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}" +
    ".kinds input{margin:3px 0 0;accent-color:var(--c);flex:none}" +
    ".kinds label{display:flex;gap:8px;align-items:flex-start;border:1px solid #e2e8f0;border-radius:10px;padding:9px 10px;cursor:pointer;font-weight:400}" +
    ".kinds label:has(input:checked){border-color:var(--c);background:color-mix(in srgb,var(--c) 7%,#fff)}" +
    ".kinds strong{display:block;font-weight:500;font-size:13px}.kinds span{font-size:12px;color:#64748b}" +
    ".anchor{display:flex;align-items:center;gap:8px;padding:9px 11px;border-radius:10px;background:#f8fafc;font-size:13px}" +
    ".err{color:#b91c1c;font-size:13px;min-height:18px;margin-top:8px}" +
    ".dlg-actions{display:flex;gap:8px;margin-top:18px;align-items:center}" +
    ".toast{position:fixed;left:50%;bottom:72px;transform:translateX(-50%);z-index:2147483003;background:#0f172b;color:#fff;padding:10px 14px;border-radius:10px;font-size:13px;box-shadow:0 8px 24px rgba(15,23,43,.3);pointer-events:none}" +
    "@media (prefers-reduced-motion:reduce){.box,.pin{transition:none}}";

  function mount() {
    root = h("div", { id: "handover-layer-root" });
    document.body.appendChild(root);
    shadow = root.attachShadow({ mode: "open" });
    shadow.appendChild(h("style", null, CSS_TEXT));
    var wrap = h("div", { class: "hl" });
    els.overlay = h("div", { class: "overlay", "aria-hidden": "true" });
    els.pins = h("div");
    els.box = h("div", { class: "box", hidden: "" });
    els.overlay.appendChild(els.box);
    els.bar = h("div", { class: "bar", role: "toolbar", "aria-label": "Handover layer" });
    els.panel = h("aside", { class: "panel", role: "complementary", "aria-label": "Handover notes", hidden: "" });
    els.dialog = h("div");
    els.toast = h("div", { class: "toast", role: "status", hidden: "" });
    els.hint = h("div", { class: "hint", hidden: "" });
    wrap.append(els.overlay, els.pins, els.bar, els.panel, els.dialog, els.toast, els.hint);
    shadow.appendChild(wrap);
    shadow.addEventListener("click", onShadowClick);
    shadow.addEventListener("change", onShadowChange);
    renderBar();
  }
  function renderBar() {
    var count = visibleNotes().length;
    els.bar.innerHTML =
      '<button type="button" data-a="toggle" aria-pressed="' + on + '" title="Show or hide the handover layer (Alt+H)">' +
      (on ? "Handover layer on" : "Handover layer") +
      ' <span class="count">' + count + "</span></button>" +
      (on
        ? '<span class="sep"></span>' +
          (editable ? '<button type="button" data-a="pick" aria-pressed="' + picking + '" title="Annotate a component (Alt+N)">+ Annotate</button>' : "") +
          '<button type="button" data-a="panel" aria-pressed="' + panelOpen + '">Notes</button>'
        : "");
  }
  function pinColour(note) {
    return kindOf(note.kind).hue;
  }
  function paint() {
    raf = 0;
    if (!on) {
      els.pins.innerHTML = "";
      els.box.hidden = true;
      return;
    }
    var notes = captureRef != null ? data.notes.filter(function (n) { return n.ref === captureRef; }) : visibleNotes();
    var html = "";
    var stack = {};
    notes.forEach(function (note) {
      if (!onThisView(note) || !note.anchor) return;
      var el = findAnchor(note.anchor);
      if (!el) return;
      var r = el.getBoundingClientRect();
      // Pins sit on the component's top-left corner, where side panels rarely cover them.
      var key = Math.round(r.left) + ":" + Math.round(r.top);
      var offset = (stack[key] = (stack[key] || 0) + 1) - 1;
      var x = Math.min(window.innerWidth - 16, Math.max(16, r.left + offset * 30));
      var y = Math.min(window.innerHeight - 16, Math.max(16, r.top));
      html +=
        '<button type="button" class="pin' + (focusRef === note.ref ? " is-focus" : "") + '" data-a="open-note" data-ref="' + note.ref + '" style="--c:' + pinColour(note) + ";left:" + x + "px;top:" + y + 'px" aria-label="Note ' + note.ref + ": " + esc(note.title) + '">' + note.ref + "</button>";
    });
    els.pins.innerHTML = html;
    var target = picking ? hoverEl : focusRef != null || captureRef != null ? findAnchor((data.notes.find(function (n) { return n.ref === (captureRef != null ? captureRef : focusRef); }) || {}).anchor) : null;
    if (target) {
      var r = target.getBoundingClientRect();
      var note = data.notes.find(function (n) { return n.ref === (captureRef != null ? captureRef : focusRef); });
      var c = picking ? "#0e7490" : note ? pinColour(note) : "#0e7490";
      els.box.hidden = false;
      els.box.style.cssText = "--c:" + c + ";left:" + (r.left - 4) + "px;top:" + (r.top - 4) + "px;width:" + (r.width + 8) + "px;height:" + (r.height + 8) + "px";
      var label = picking ? anchorFrom(target).label : note && note.anchor ? note.anchor.label : "";
      els.box.innerHTML = label ? '<span class="box-label">' + esc(label) + "</span>" : "";
    } else els.box.hidden = true;
  }
  function schedule() {
    if (!raf) raf = requestAnimationFrame(paint);
  }
  function loop() {
    if (!on) return;
    paint();
    setTimeout(function () {
      requestAnimationFrame(loop);
    }, 120);
  }

  function noteCard(note) {
    var k = kindOf(note.kind);
    var mine = editable;
    return (
      '<div class="note' + (focusRef === note.ref ? " is-focus" : "") + '" role="button" tabindex="0" data-a="focus-note" data-ref="' + note.ref + '">' +
      '<div class="top"><span class="ref">#' + note.ref + '</span><span class="kind" style="--c:' + k.hue + '">' + k.label + '</span><span class="sp"></span><span class="where">' + esc(handoverName(note.handover)) + "</span></div>" +
      "<h3>" + esc(note.title) + '</h3><div class="where">' + esc(whereText(note)) + "</div>" +
      '<div class="body">' + md(note.body) + "</div>" +
      (focusRef === note.ref
        ? '<div class="meta"><span>' + esc(note.author || "Unknown") + "</span><span>" + esc(note.updatedAt || note.createdAt || "") + "</span></div>" +
          '<div class="actions">' +
          (mine ? '<button type="button" class="btn small" data-a="edit" data-ref="' + note.ref + '">Edit</button>' : "") +
          '<button type="button" class="btn small" data-a="copy" data-ref="' + note.ref + '">Copy as ticket</button>' +
          (mine ? '<button type="button" class="btn small danger" data-a="delete" data-ref="' + note.ref + '">Delete</button>' : "") +
          "</div>"
        : "") +
      "</div>"
    );
  }
  function renderPanel() {
    if (!panelOpen) {
      els.panel.hidden = true;
      return;
    }
    els.panel.hidden = false;
    var notes = visibleNotes();
    var here = notes.filter(function (n) { return n.anchor && onThisView(n); });
    var global = notes.filter(function (n) { return !n.anchor; });
    var elsewhere = notes.filter(function (n) { return n.anchor && !onThisView(n); });
    var opts =
      '<option value="next"' + (filter.handover === "next" ? " selected" : "") + ">Next handover</option>" +
      data.handovers
        .slice()
        .reverse()
        .map(function (ho) { return '<option value="' + esc(ho.id) + '"' + (filter.handover === ho.id ? " selected" : "") + ">" + esc(ho.name) + "</option>"; })
        .join("") +
      '<option value="all"' + (filter.handover === "all" ? " selected" : "") + ">All notes</option>";
    var group = function (title, list) {
      return list.length ? '<p class="group">' + title + " · " + list.length + "</p>" + list.map(noteCard).join("") : "";
    };
    els.panel.innerHTML =
      '<header><div class="row"><div class="sp"><h2>Handover notes</h2><p class="sub">' + esc(viewLabel(currentView())) + '</p></div><button type="button" class="x" data-a="panel" aria-label="Close notes">×</button></div>' +
      '<div class="filters"><select data-f="handover" aria-label="Handover">' + opts + "</select>" +
      [{ key: "all", label: "All" }].concat(KINDS).map(function (k) { return '<button type="button" class="chip" data-a="kind" data-kind="' + k.key + '" aria-pressed="' + (filter.kind === k.key) + '">' + k.label + "</button>"; }).join("") +
      "</div>" +
      (editable ? "" : '<p class="readonly">View only. Notes are edited when the prototype runs locally.</p>') +
      "</header>" +
      '<div class="list">' +
      (notes.length ? group("On this page", here) + group("Everywhere", global) + group("Elsewhere", elsewhere) : '<div class="empty">No notes here yet.' + (editable ? " Choose <strong>+ Annotate</strong> and click a component." : "") + "</div>") +
      "</div>" +
      (editable ? '<div class="foot"><button type="button" class="btn small" data-a="new-page">Note on this page</button><button type="button" class="btn small" data-a="new-global">Global note</button><span class="sp"></span><button type="button" class="btn small" data-a="profile">' + esc((profile() || {}).name || "Your name") + "</button></div>" : "");
  }
  function render() {
    renderBar();
    renderPanel();
    schedule();
  }
  function toast(message) {
    els.toast.textContent = message;
    els.toast.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(function () {
      els.toast.hidden = true;
    }, 3200);
  }
  function hint(message) {
    els.hint.textContent = message || "";
    els.hint.hidden = !message;
  }

  // ---------- Editor ----------
  function openEditor(note, anchor) {
    var p = profile();
    if (!p) return openProfile(function () { openEditor(note, anchor); });
    var editing = Boolean(note);
    var n = note || { kind: anchor ? "feature" : "global", title: "", body: "", anchor: anchor, handover: null };
    var current = n.anchor;
    var handovers =
      '<option value="">Next handover</option>' +
      data.handovers.slice().reverse().map(function (ho) { return '<option value="' + esc(ho.id) + '"' + (n.handover === ho.id ? " selected" : "") + ">" + esc(ho.name) + "</option>"; }).join("");
    els.dialog.innerHTML =
      '<div class="scrim" data-a="scrim"><form class="dialog" role="dialog" aria-modal="true" aria-labelledby="hl-ed-title" data-form="note">' +
      '<h2 id="hl-ed-title">' + (editing ? "Edit note #" + n.ref : "New handover note") + "</h2>" +
      '<div class="anchor">' + (current ? "Attached to <strong>" + esc(whereText({ anchor: current })) + "</strong>" : "Applies everywhere in the prototype") + "</div>" +
      '<div class="field"><label>Type</label><div class="kinds">' +
      KINDS.map(function (k) {
        var helpText = { feature: "Something new to build", change: "Changes something already handed over", global: "Affects many screens, like motion or hover states", fix: "Corrects a mistake" }[k.key];
        return '<label style="--c:' + k.hue + '"><input type="radio" name="kind" value="' + k.key + '"' + (n.kind === k.key ? " checked" : "") + "><span><strong>" + k.label + "</strong><span>" + helpText + "</span></span></label>";
      }).join("") +
      "</div></div>" +
      '<div class="field"><label for="hl-title">Title</label><input id="hl-title" name="title" required maxlength="120" value="' + esc(n.title) + '" placeholder="For example, Team cards show health at a glance"></div>' +
      '<div class="field"><label for="hl-body">Description</label><textarea id="hl-body" name="body" placeholder="What it does, how it behaves, edge cases and anything developers should know.">' + esc(n.body) + '</textarea><span class="help">Use a blank line between paragraphs, "- " for bullets, **bold** and `code`.</span></div>' +
      '<div class="field"><label for="hl-handover">Handover</label><select id="hl-handover" name="handover">' + handovers + "</select></div>" +
      '<p class="err" role="alert"></p>' +
      '<div class="dlg-actions">' + (editing ? '<button type="button" class="btn danger" data-a="delete" data-ref="' + n.ref + '">Delete</button>' : "") + '<span class="sp"></span><button type="button" class="btn" data-a="close-dialog">Cancel</button><button type="submit" class="btn pri">' + (editing ? "Save changes" : "Add note") + "</button></div>" +
      "</form></div>";
    var form = els.dialog.querySelector("form");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(form);
      var title = String(fd.get("title") || "").trim();
      if (!title) {
        form.querySelector(".err").textContent = "Add a title so the note can be found later.";
        return;
      }
      var now = today();
      var target = editing ? note : { id: "n-" + Date.now().toString(36), ref: data.nextRef++, type: "annotation", anchor: current, author: p.name, createdAt: now };
      target.kind = String(fd.get("kind") || "feature");
      target.title = title;
      target.body = String(fd.get("body") || "").trim();
      target.handover = String(fd.get("handover") || "") || null;
      target.updatedAt = now;
      if (editing) target.editedBy = p.name;
      else data.notes.push(target);
      closeDialog();
      focusRef = target.ref;
      panelOpen = true;
      render();
      persist().then(function (ok) {
        if (ok) toast(editing ? "Note #" + target.ref + " saved" : "Note #" + target.ref + " added");
      });
    });
    setTimeout(function () {
      form.querySelector("#hl-title").focus();
    }, 20);
  }
  function openProfile(next) {
    var p = profile() || { name: "", role: "" };
    els.dialog.innerHTML =
      '<div class="scrim" data-a="scrim"><form class="dialog" role="dialog" aria-modal="true" aria-labelledby="hl-pr-title" data-form="profile">' +
      '<h2 id="hl-pr-title">Who\'s writing these notes?</h2><p class="sub" style="margin:0;color:#64748b;font-size:13.5px">Your name goes on each note you write. It\'s saved in this browser only.</p>' +
      '<div class="field"><label for="hl-name">Name</label><input id="hl-name" name="name" required value="' + esc(p.name) + '" autocomplete="name"></div>' +
      '<div class="field"><label for="hl-role">Role <span class="help">Optional</span></label><input id="hl-role" name="role" value="' + esc(p.role) + '" placeholder="For example, Product designer"></div>' +
      '<div class="dlg-actions"><span class="sp"></span><button type="button" class="btn" data-a="close-dialog">Cancel</button><button type="submit" class="btn pri">Save</button></div></form></div>';
    var form = els.dialog.querySelector("form");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(form);
      var name = String(fd.get("name") || "").trim();
      if (!name) return;
      saveProfile({ name: name, role: String(fd.get("role") || "").trim() });
      closeDialog();
      render();
      if (next) next();
    });
    setTimeout(function () {
      form.querySelector("#hl-name").focus();
    }, 20);
  }
  function closeDialog() {
    els.dialog.innerHTML = "";
  }
  function confirmDelete(ref) {
    var note = data.notes.find(function (n) { return n.ref === ref; });
    if (!note) return;
    els.dialog.innerHTML =
      '<div class="scrim" data-a="scrim"><div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="hl-del"><h2 id="hl-del">Delete note #' + ref + "?</h2><p>" + esc(note.title) + '</p><div class="dlg-actions"><span class="sp"></span><button type="button" class="btn" data-a="close-dialog">Cancel</button><button type="button" class="btn danger" data-a="delete-now" data-ref="' + ref + '">Delete note</button></div></div></div>';
    els.dialog.querySelector('[data-a="delete-now"]').focus();
  }

  // ---------- Navigation between notes ----------
  function goToNote(note) {
    focusRef = note.ref;
    var needsNav = note.anchor && note.anchor.view && note.anchor.view !== currentView();
    var nav = needsNav && cfg.goTo ? Promise.resolve(cfg.goTo(note.anchor.view)) : Promise.resolve();
    return nav
      .then(function () {
        return new Promise(function (resolve) { setTimeout(resolve, needsNav ? 320 : 0); });
      })
      .then(function () {
        if (cfg.reveal && note.anchor && !findAnchor(note.anchor)) return Promise.resolve(cfg.reveal(note.anchor)).then(function () { return new Promise(function (r) { setTimeout(r, 320); }); });
      })
      .then(function () {
        var el = findAnchor(note.anchor);
        if (el) el.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        render();
        return el;
      });
  }
  function ticketText(note) {
    var url = location.origin + location.pathname + "#hl=" + note.ref;
    return "[#" + note.ref + "] " + note.title + "\n\nType: " + kindOf(note.kind).label + " · " + handoverName(note.handover) + "\nWhere: " + whereText(note) + (note.anchor && note.anchor.spec ? " (" + note.anchor.spec + ")" : "") + "\n\n" + (note.body || "") + "\n\nPrototype: " + url;
  }

  // ---------- Events ----------
  function setOn(value) {
    on = value;
    if (!on) {
      stopPicking();
      panelOpen = false;
      focusRef = null;
    }
    render();
    if (on) loop();
  }
  function startPicking() {
    if (!profile()) return openProfile(startPicking);
    picking = true;
    hint("Click a component to annotate it. Press Esc to cancel.");
    render();
  }
  function stopPicking() {
    picking = false;
    hoverEl = null;
    hint("");
    render();
  }
  function onShadowClick(e) {
    var t = e.target.closest("[data-a]");
    if (!t) return;
    var a = t.getAttribute("data-a");
    var ref = Number(t.getAttribute("data-ref"));
    var note = data.notes.find(function (n) { return n.ref === ref; });
    if (a === "scrim" && e.target !== t) return;
    if (a === "toggle") setOn(!on);
    else if (a === "pick") picking ? stopPicking() : startPicking();
    else if (a === "panel") {
      panelOpen = !panelOpen;
      render();
    } else if (a === "kind") {
      filter.kind = t.getAttribute("data-kind");
      render();
    } else if (a === "open-note" || a === "focus-note") {
      if (a === "focus-note" && focusRef === ref && e.target.closest(".actions")) return;
      panelOpen = true;
      if (note) goToNote(note);
    } else if (a === "edit" && note) openEditor(note);
    else if (a === "delete") confirmDelete(ref);
    else if (a === "delete-now") {
      data.notes = data.notes.filter(function (n) { return n.ref !== ref; });
      if (focusRef === ref) focusRef = null;
      closeDialog();
      render();
      persist().then(function (ok) {
        if (ok) toast("Note #" + ref + " deleted");
      });
    } else if (a === "copy" && note) {
      var text = ticketText(note);
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
        .then(function () { toast("Copied #" + ref + ", ready to paste into a ticket"); })
        .catch(function () { window.prompt("Copy this text", text); });
    } else if (a === "close-dialog" || a === "scrim") closeDialog();
    else if (a === "new-page") openEditor(null, { view: currentView(), label: "Page" });
    else if (a === "new-global") openEditor(null, null);
    else if (a === "profile") openProfile();
  }
  function onShadowChange(e) {
    if (e.target.getAttribute("data-f") === "handover") {
      filter.handover = e.target.value;
      focusRef = null;
      render();
    }
  }
  function pathTarget(e) {
    var path = e.composedPath ? e.composedPath() : [e.target];
    if (path.indexOf(root) !== -1) return null;
    return path.find(function (n) { return n.nodeType === 1; }) || null;
  }
  document.addEventListener(
    "mousemove",
    function (e) {
      if (!picking) return;
      var t = pathTarget(e);
      hoverEl = t ? t.closest("[data-spec]") || t : null;
      schedule();
    },
    true,
  );
  // Listen on window in the capture phase, so annotate mode sees clicks before the prototype's own handlers.
  ["click", "mousedown", "mouseup", "pointerdown", "pointerup", "contextmenu", "dblclick"].forEach(function (type) {
    window.addEventListener(
      type,
      function (e) {
        if (!picking) return;
        var t = pathTarget(e);
        if (!t) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (type === "click") {
          var anchor = anchorFrom(t.closest("[data-spec]") || t);
          stopPicking();
          openEditor(null, anchor);
        }
      },
      true,
    );
  });
  window.addEventListener(
    "keydown",
    function (e) {
      var typing = /^(input|textarea|select)$/i.test((e.composedPath()[0] || {}).tagName || "") || (e.composedPath()[0] || {}).isContentEditable;
      if (e.altKey && e.code === "KeyH" && !typing) {
        e.preventDefault();
        setOn(!on);
      } else if (on && e.altKey && e.code === "KeyN" && editable && !typing) {
        e.preventDefault();
        startPicking();
      } else if (e.key === "Escape" && (picking || els.dialog.innerHTML)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (els.dialog.innerHTML) closeDialog();
        else stopPicking();
      } else if (e.key === "Enter" && e.composedPath()[0] && e.composedPath()[0].getAttribute && e.composedPath()[0].getAttribute("data-a") === "focus-note") {
        e.composedPath()[0].click();
      }
    },
    true,
  );
  window.addEventListener("resize", schedule);
  window.addEventListener("scroll", schedule, true);
  window.addEventListener("hashchange", fromHash);
  function fromHash() {
    var m = /(?:^|[#&])hl=(\d+)/.exec(location.hash);
    if (!m) return;
    var note = data.notes.find(function (n) { return n.ref === Number(m[1]); });
    if (!note) return;
    filter.handover = note.handover || "next";
    if (!on) setOn(true);
    panelOpen = true;
    goToNote(note);
  }

  // ---------- Public API ----------
  window.HandoverLayer = {
    init: function (options) {
      cfg = options || {};
      var start = function () {
        mount();
        load().then(function () {
          render();
          fromHash();
        });
      };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
      else start();
    },
    // Used by the report tool: show one note in isolation and return where it is.
    capture: function (ref) {
      var note = data.notes.find(function (n) { return n.ref === ref; });
      if (!note) return Promise.resolve(null);
      captureRef = ref;
      on = true;
      panelOpen = false;
      els.bar.style.display = "none";
      return goToNote(note).then(function (el) {
        paint();
        if (!el) return { found: false };
        var r = el.getBoundingClientRect();
        return { found: true, x: r.left, y: r.top, width: r.width, height: r.height };
      });
    },
    data: function () {
      return JSON.parse(JSON.stringify(data));
    },
    isEditable: function () {
      return editable;
    },
  };
})();
