/*
 * Handover layer
 * A switchable overlay for annotating a working prototype, ready for developer handover.
 * No dependencies. Drop it into any prototype and call HandoverLayer.init({...}).
 *
 * The look is deliberately unlike the product: small, dark, Figma-style annotations
 * with dashed outlines and leader lines, so nobody mistakes a note for the UI.
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

  // What changed, for the handover document's sections.
  var KINDS = [
    { key: "feature", label: "New feature", help: "Something new to build" },
    { key: "change", label: "Change", help: "Changes something already handed over" },
    { key: "global", label: "Global change", help: "Affects many screens, like motion or hover states" },
    { key: "fix", label: "Fix", help: "Corrects a mistake" },
  ];
  // Who it's for. Editable per project, stored with the notes.
  var DEFAULT_CATEGORIES = [
    { key: "development", label: "Development", colour: "#2f9e5b" },
    { key: "interaction", label: "Interaction", colour: "#3b82f6" },
    { key: "accessibility", label: "Accessibility", colour: "#e040a8" },
    { key: "content", label: "Content", colour: "#e07b10" },
  ];
  var PALETTE = ["#2f9e5b", "#3b82f6", "#e040a8", "#e07b10", "#8b5cf6", "#ef4444", "#14b8a6", "#a3a3a3"];
  var PROFILE_KEY = "handover-layer-profile";
  var BACKUP_KEY = "handover-layer-backup";
  var BLUE = "#0d99ff";

  var cfg = {};
  var data = { version: 1, project: "", nextRef: 1, categories: DEFAULT_CATEGORIES.slice(), handovers: [], notes: [] };
  var editable = false;
  var on = false;
  var picking = false;
  var panelOpen = false;
  var openRef = null; // the note whose card is open
  var editor = null; // { note, anchor, draft } while writing or editing
  var menu = null; // which dropdown is open in the editor: "category" | "kind" | "more"
  var filter = { handover: "next", category: "all" };
  var captureRef = null;
  var root, shadow, toolsHost, toolsShadow, els = {};
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
    return String(text || "")
      .trim()
      .split(/\n{2,}/)
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
  function categoryOf(key) {
    return (data.categories || []).find(function (c) { return c.key === key; }) || null;
  }
  function noteColour(note) {
    var c = categoryOf(note.category);
    return c ? c.colour : "#a3a3a3";
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
  function findNote(ref) {
    return data.notes.find(function (n) { return n.ref === ref; }) || null;
  }
  function reducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
    if (!el || root.contains(el) || (toolsHost && toolsHost.contains(el))) return null;
    var r = el.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return el;
  }
  function onThisView(note) {
    if (!note.anchor) return false;
    return !note.anchor.view || note.anchor.view === currentView();
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
        if (filter.category !== "all" && (n.category || "none") !== filter.category) return false;
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
      categories: Array.isArray(d.categories) && d.categories.length ? d.categories : DEFAULT_CATEGORIES.slice(),
      handovers: Array.isArray(d.handovers) ? d.handovers : [],
      notes: Array.isArray(d.notes) ? d.notes : [],
    };
    out.notes.forEach(function (n) {
      out.nextRef = Math.max(out.nextRef, (n.ref || 0) + 1);
    });
    return out;
  }

  // ---------- Styles ----------
  // Figma-like: Inter (or the system face), 12–13px, dark cards, blue dashed guides.
  var CSS_TEXT =
    ":host{all:initial}*{box-sizing:border-box}[hidden]{display:none!important}" +
    ".hl{--bg:#2c2c2c;--bg2:#383838;--bg3:#444;--line:#4a4a4a;--text:#f5f5f5;--muted:#b3b3b3;--blue:" + BLUE + ";font:12.5px/1.45 Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;color:var(--text);-webkit-font-smoothing:antialiased}" +
    "button{font:inherit;color:inherit}" +
    // Guides on the page
    ".overlay{position:fixed;inset:0;pointer-events:none;z-index:0}" +
    ".outline{position:fixed;border:1px dashed var(--blue);border-radius:6px;pointer-events:none}" +
    ".outline.is-strong{border-width:1.5px;background:rgba(13,153,255,.05)}" +
    ".pick{position:fixed;border:1.5px solid var(--blue);border-radius:6px;background:rgba(13,153,255,.06);pointer-events:none}" +
    ".pick-label{position:absolute;left:-1px;top:-22px;background:var(--blue);color:#fff;font-weight:500;font-size:11.5px;padding:2px 7px;border-radius:4px;white-space:nowrap}" +
    "svg.leader{position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;overflow:visible}" +
    // Chips sitting on components
    ".chip{position:fixed;display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 8px 0 6px;border-radius:6px;background:var(--bg);color:var(--text);border:1px solid var(--line);box-shadow:0 2px 6px rgba(0,0,0,.25);font-size:11.5px;font-weight:500;white-space:nowrap;cursor:pointer;pointer-events:auto;transform:translateY(-100%);max-width:220px;z-index:1}" +
    ".chip .dot{width:8px;height:8px;border-radius:50%;flex:none}" +
    ".chip .t{overflow:hidden;text-overflow:ellipsis}" +
    ".chip .n{color:var(--muted);font-variant-numeric:tabular-nums}" +
    ".chip:hover,.chip.is-open{background:#1e1e1e;border-color:var(--blue)}" +
    ".chip:focus-visible{outline:2px solid var(--blue);outline-offset:2px}" +
    ".chip.is-held{opacity:.6}.chip.is-held .t{font-style:italic}" +
    ".held{display:inline-flex;align-items:center;height:18px;padding:0 6px;border-radius:4px;background:var(--bg3);color:var(--muted);font-size:11px}" +
    // Cards and the editor
    ".card{position:fixed;width:300px;max-height:min(70vh,560px);overflow:auto;background:var(--bg);color:var(--text);border:1px solid var(--line);border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.35);padding:12px 14px 12px;pointer-events:auto;z-index:2}" +
    ".card-head{display:flex;align-items:center;gap:6px;margin-bottom:8px}" +
    ".tag{display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:5px;font-weight:600;font-size:12px;color:#111;background:var(--c)}" +
    ".tag.none{background:var(--bg3);color:var(--muted);font-weight:500}" +
    ".kind{color:var(--muted);font-size:11.5px}" +
    ".sp{flex:1}" +
    ".ico{all:unset;cursor:pointer;width:26px;height:26px;display:grid;place-items:center;border-radius:6px;color:var(--muted);font-size:15px;line-height:1}" +
    ".ico:hover{background:var(--bg2);color:var(--text)}.ico:focus-visible{outline:2px solid var(--blue)}" +
    ".card h3{margin:2px 0 4px;font-size:13.5px;font-weight:600;line-height:1.35}" +
    ".where{color:var(--muted);font-size:11.5px}" +
    ".body{margin-top:8px;color:#e6e6e6;font-size:12.5px}.body p{margin:0 0 6px}.body ul{margin:0 0 6px;padding-left:16px}.body li{margin:2px 0}" +
    ".body code,code{font:11.5px ui-monospace,Menlo,monospace;background:var(--bg3);padding:1px 4px;border-radius:4px;color:#fff}" +
    ".meta{display:flex;flex-wrap:wrap;gap:4px 10px;margin-top:10px;padding-top:8px;border-top:1px solid var(--line);color:var(--muted);font-size:11.5px}" +
    ".acts{display:flex;gap:4px;margin-top:8px;flex-wrap:wrap}" +
    ".btn{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 10px;border-radius:6px;font-size:12px;font-weight:500;color:var(--text);background:var(--bg2)}" +
    ".btn:hover{background:var(--bg3)}.btn:focus-visible{outline:2px solid var(--blue);outline-offset:1px}" +
    ".btn.pri{background:var(--blue);color:#fff}.btn.pri:hover{background:#0a84dc}" +
    ".btn.ghost{background:transparent}.btn.ghost:hover{background:var(--bg2)}" +
    ".btn.danger{color:#ff8a80}" +
    ".btn[disabled]{opacity:.45;pointer-events:none}" +
    ".editor .title-in{all:unset;display:block;width:100%;font-size:14px;font-weight:600;color:var(--text);padding:4px 0}" +
    ".editor .title-in::placeholder,.editor .body-in::placeholder{color:#8a8a8a}" +
    ".editor .body-in{all:unset;display:block;width:100%;min-height:96px;font-size:12.5px;line-height:1.5;color:#e6e6e6;white-space:pre-wrap;padding:4px 0}" +
    ".editor .hint-line{color:#8a8a8a;font-size:11px;margin-top:4px}" +
    ".editor .foot{display:flex;align-items:center;gap:6px;margin-top:10px;padding-top:10px;border-top:1px solid var(--line)}" +
    ".sel{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 8px;border-radius:5px;background:var(--bg2);color:var(--text);font-size:12px;white-space:nowrap}" +
    ".sel:hover{background:var(--bg3)}.sel:focus-visible{outline:2px solid var(--blue)}" +
    ".sel .caret{font-size:9px;color:var(--muted)}" +
    ".sel.tagsel{color:#111;font-weight:600;background:var(--c)}.sel.tagsel .caret{color:#111}" +
    ".sel.tagsel.none{background:var(--bg2);color:var(--muted);font-weight:500}" +
    ".err{color:#ff8a80;font-size:12px;min-height:0;margin-top:6px}" +
    // Dropdown menus
    ".menu-wrap{position:relative;display:inline-block}" +
    ".menu{position:absolute;left:0;top:calc(100% + 6px);min-width:200px;background:#1e1e1e;border:1px solid var(--line);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.4);padding:6px;z-index:5}" +
    ".menu.right{left:auto;right:0}" +
    ".menu button{all:unset;cursor:pointer;display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;padding:7px 10px 7px 8px;border-radius:6px;font-size:12.5px;color:var(--text)}" +
    ".menu button:hover,.menu button:focus-visible{background:var(--blue);color:#fff}" +
    ".menu .tick{width:14px;text-align:center;flex:none}" +
    ".menu .sw{width:12px;height:12px;border-radius:50%;flex:none}" +
    ".menu hr{border:0;border-top:1px solid var(--line);margin:6px 2px}" +
    ".menu .sub{color:var(--muted);font-size:11px;display:block}" +
    // Panel
    ".panel{position:fixed;top:var(--top,0px);right:0;bottom:0;width:min(340px,100vw);background:var(--bg);color:var(--text);border-left:1px solid var(--line);box-shadow:-10px 0 30px rgba(0,0,0,.3);display:flex;flex-direction:column;pointer-events:auto;z-index:3}" +
    ".panel header{padding:12px 14px 10px;border-bottom:1px solid var(--line)}" +
    ".panel h2{margin:0;font-size:13px;font-weight:600}.panel .sub{margin:2px 0 0;color:var(--muted);font-size:11.5px}" +
    ".row{display:flex;align-items:center;gap:6px}" +
    ".filters{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}" +
    ".pf{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 8px;border-radius:999px;border:1px solid var(--line);font-size:11.5px;color:var(--muted)}" +
    ".pf .sw{width:8px;height:8px;border-radius:50%}" +
    ".pf[aria-pressed=true]{border-color:var(--blue);color:var(--text);background:rgba(13,153,255,.15)}.pf:focus-visible{outline:2px solid var(--blue)}" +
    "select.hsel{background:var(--bg2);color:var(--text);border:1px solid var(--line);border-radius:6px;padding:3px 6px;font:inherit;font-size:12px}" +
    ".list{flex:1;overflow-y:auto;padding:6px 8px 20px}" +
    ".group{margin:12px 6px 4px;font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#8a8a8a}" +
    ".item{all:unset;box-sizing:border-box;display:block;width:100%;cursor:pointer;padding:8px 8px;border-radius:8px}" +
    ".item:hover{background:var(--bg2)}.item.is-open{background:rgba(13,153,255,.16)}.item:focus-visible{outline:2px solid var(--blue)}" +
    ".item .top{display:flex;align-items:center;gap:6px}" +
    ".item .dot{width:8px;height:8px;border-radius:50%;flex:none}" +
    ".item .n{color:var(--muted);font-size:11.5px;font-variant-numeric:tabular-nums}" +
    ".item .ti{font-weight:500;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    ".item .where{display:block;margin:2px 0 0 14px}" +
    ".empty{padding:28px 12px;text-align:center;color:var(--muted)}" +
    ".readonly{margin:8px 0 0;padding:6px 8px;border-radius:6px;background:var(--bg2);color:var(--muted);font-size:11.5px}" +
    ".pfoot{padding:10px 12px;border-top:1px solid var(--line);display:flex;gap:6px;flex-wrap:wrap}" +
    // Small dialogs: profile, categories, delete
    ".scrim{position:fixed;inset:0;background:rgba(0,0,0,.35);display:grid;place-items:center;pointer-events:auto;padding:16px;z-index:6}" +
    ".dialog{width:min(360px,100%);background:var(--bg);color:var(--text);border:1px solid var(--line);border-radius:12px;box-shadow:0 16px 40px rgba(0,0,0,.45);padding:16px}" +
    ".dialog h2{margin:0 0 4px;font-size:14px;font-weight:600}.dialog p{margin:0;color:var(--muted)}" +
    ".field{display:grid;gap:4px;margin-top:12px}.field label{font-size:11.5px;color:var(--muted)}" +
    ".field input{all:unset;box-sizing:border-box;width:100%;height:30px;padding:0 9px;border-radius:6px;background:var(--bg2);border:1px solid var(--line);font-size:12.5px;color:var(--text)}" +
    ".field input:focus{border-color:var(--blue)}" +
    ".cat-row{display:flex;align-items:center;gap:6px;margin-top:6px}" +
    ".cat-row input{all:unset;box-sizing:border-box;flex:1;height:28px;padding:0 8px;border-radius:6px;background:var(--bg2);border:1px solid var(--line);font-size:12.5px}" +
    ".cat-row input:focus{border-color:var(--blue)}" +
    ".swatch{all:unset;cursor:pointer;width:22px;height:22px;border-radius:50%;flex:none;box-shadow:inset 0 0 0 2px rgba(255,255,255,.15)}" +
    ".swatch:focus-visible{outline:2px solid var(--blue);outline-offset:2px}" +
    ".dlg-acts{display:flex;gap:6px;margin-top:14px;align-items:center}" +
    ".hint{position:fixed;left:50%;top:calc(var(--top,0px) + 10px);transform:translateX(-50%);background:var(--bg);color:var(--text);border:1px solid var(--line);padding:7px 12px;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.3);pointer-events:none;z-index:4}" +
    ".toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--bg);color:var(--text);border:1px solid var(--line);padding:8px 12px;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.3);pointer-events:none;z-index:7}" +
    // Controls (in the host's context bar, or floating)
    ".tools{display:inline-flex;align-items:center;gap:2px;padding:2px;border-radius:7px;background:var(--bg);border:1px solid #1a1a1a;box-shadow:0 1px 2px rgba(0,0,0,.2);pointer-events:auto}" +
    ".tools.floating{position:fixed;left:12px;bottom:12px;z-index:2147483001;padding:3px;border-radius:9px;box-shadow:0 8px 24px rgba(0,0,0,.3)}" +
    ".tools button{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:5px;height:20px;padding:0 8px;border-radius:5px;font-size:11.5px;font-weight:500;color:#e6e6e6;white-space:nowrap}" +
    ".tools.floating button{height:26px;padding:0 10px}" +
    ".tools button:hover{background:var(--bg2)}.tools button:focus-visible{outline:2px solid var(--blue);outline-offset:1px}" +
    ".tools button[aria-pressed=true]{background:var(--blue);color:#fff}" +
    ".tools .count{font-variant-numeric:tabular-nums;color:var(--muted)}.tools button[aria-pressed=true] .count{color:#dbeeff}" +
    ".tools .sep{width:1px;height:14px;background:var(--line);margin:0 2px}" +
    ".tools .kbd{color:#8a8a8a;font-size:10.5px}" +
    "@media (prefers-reduced-motion:reduce){*{transition:none!important}}";

  // ---------- Mounting ----------
  function mount() {
    // The root is a manual popover so it can sit in the browser's top layer, above modal dialogs.
    root = h("div", { id: "handover-layer-root" });
    root.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:transparent;overflow:visible;pointer-events:none;color:inherit;z-index:2147483000";
    if (typeof root.showPopover === "function") root.setAttribute("popover", "manual");
    document.body.appendChild(root);
    raiseRoot();
    shadow = root.attachShadow({ mode: "open" });
    shadow.appendChild(h("style", null, CSS_TEXT));
    var wrap = h("div", { class: "hl" });
    els.overlay = h("div", { class: "overlay", "aria-hidden": "true" });
    els.outlines = h("div");
    els.pick = h("div", { class: "pick", hidden: "" });
    els.leader = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    els.leader.setAttribute("class", "leader");
    els.overlay.append(els.outlines, els.leader, els.pick);
    els.chips = h("div", { style: "position:relative;z-index:1" });
    els.card = h("div", { style: "position:relative;z-index:2" });
    els.panel = h("aside", { style: "z-index:3", class: "panel", role: "complementary", "aria-label": "Handover notes", hidden: "" });
    els.dialog = h("div", { style: "position:relative;z-index:6" });
    els.toast = h("div", { class: "toast", role: "status", hidden: "" });
    els.hint = h("div", { class: "hint", hidden: "" });
    wrap.append(els.overlay, els.chips, els.card, els.panel, els.dialog, els.toast, els.hint);
    shadow.appendChild(wrap);
    shadow.addEventListener("click", onClick);
    shadow.addEventListener("change", onChange);
    shadow.addEventListener("input", onInput);

    // Controls go into the host's context bar when it offers a slot, otherwise they float.
    var slot = cfg.toolbar && (typeof cfg.toolbar === "string" ? document.querySelector(cfg.toolbar) : cfg.toolbar);
    if (slot) {
      toolsHost = slot;
      toolsShadow = slot.shadowRoot || slot.attachShadow({ mode: "open" });
      toolsShadow.innerHTML = "";
      toolsShadow.appendChild(h("style", null, CSS_TEXT));
      els.tools = h("div", { class: "hl tools", role: "toolbar", "aria-label": "Handover notes" });
      toolsShadow.appendChild(els.tools);
      toolsShadow.addEventListener("click", onClick);
    } else {
      els.tools = h("div", { class: "tools floating", role: "toolbar", "aria-label": "Handover notes" });
      wrap.appendChild(els.tools);
    }
    // While a modal dialog is open the host bar can't be clicked, so a floating copy of the controls appears.
    els.floatTools = h("div", { class: "tools floating", role: "toolbar", "aria-label": "Handover notes", hidden: "" });
    if (toolsHost) wrap.appendChild(els.floatTools);
  }
  function modalOpen() {
    try {
      return Boolean(document.querySelector("dialog:modal"));
    } catch (e) {
      return Boolean(document.querySelector("dialog[open]"));
    }
  }
  // Re-show the popover so it stays above anything the prototype opened since.
  // A dialog that opens (or re-opens) goes to the top of the top layer, so lift the layer again after it.
  function raiseRoot(force) {
    if (!root || typeof root.showPopover !== "function") return;
    try {
      if (root.matches(":popover-open")) {
        if (!force) return;
        root.hidePopover();
      }
      root.showPopover();
    } catch (e) {}
  }
  // A modal dialog makes everything outside it inert, even layers drawn above it. So while one is open,
  // the layer lives inside that dialog (and returns to <body> afterwards). The prototype may also rewrite
  // a dialog's contents, so put the layer back whenever it's been removed.
  function topModal() {
    var list = [];
    try {
      list = [].slice.call(document.querySelectorAll("dialog:modal"));
    } catch (e) {
      list = [].slice.call(document.querySelectorAll("dialog[open]"));
    }
    return list[list.length - 1] || null;
  }
  var homing = false;
  function ensureHome() {
    if (!root || homing) return;
    var home = topModal() || document.body;
    if (root.parentNode === home && root.isConnected) return;
    homing = true;
    home.appendChild(root);
    raiseRoot(true);
    homing = false;
    schedule();
  }
  new MutationObserver(function (records) {
    if (homing) return;
    if (
      records.some(function (r) {
        return (r.type === "attributes" && r.target.tagName === "DIALOG") || (r.type === "childList" && root && !root.isConnected);
      })
    )
      setTimeout(ensureHome, 0);
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["open"] });
  function topOffset() {
    var bar = toolsHost && toolsHost.closest("[data-handover-bar]");
    return bar ? bar.getBoundingClientRect().bottom : 0;
  }

  // ---------- Rendering ----------
  function renderTools() {
    var count = visibleNotes().length;
    var html =
      '<button type="button" data-a="toggle" aria-pressed="' + on + '" title="Show or hide notes (Alt+H)"><span aria-hidden="true">◎</span> Notes <span class="count">' + count + "</span></button>" +
      (on
        ? '<span class="sep" aria-hidden="true"></span>' +
          (editable ? '<button type="button" data-a="pick" aria-pressed="' + picking + '" title="Annotate a component (Alt+N)">+ Annotate</button>' : "") +
          '<button type="button" data-a="panel" aria-pressed="' + panelOpen + '" title="List all notes">List</button>'
        : "");
    els.tools.innerHTML = html;
    if (els.floatTools) els.floatTools.innerHTML = html;
  }
  function chipHtml(note, x, y) {
    var k = categoryOf(note.category);
    return (
      '<button type="button" class="chip' + (openRef === note.ref ? " is-open" : "") + (note.hold ? " is-held" : "") + '" data-a="open" data-ref="' + note.ref + '" style="left:' + x + "px;top:" + y + 'px" aria-label="Note ' + note.ref + ": " + esc(note.title) + '">' +
      '<span class="dot" style="background:' + noteColour(note) + '" aria-hidden="true"></span><span class="n">' + note.ref + '</span><span class="t">' + esc(note.title) + "</span></button>"
    );
  }
  function paint() {
    raf = 0;
    if (!root) return;
    ensureHome();
    if (els.floatTools && toolsHost) els.floatTools.hidden = !modalOpen();
    var topBar = modalOpen() ? 0 : topOffset();
    els.panel.style.setProperty("--top", topBar + "px");
    els.hint.style.setProperty("--top", topBar + "px");
    if (!on) {
      els.outlines.innerHTML = "";
      els.chips.innerHTML = "";
      els.leader.innerHTML = "";
      els.pick.hidden = true;
      return;
    }
    var notes = captureRef != null ? [findNote(captureRef)].filter(Boolean) : visibleNotes();
    var outlines = "";
    var chips = "";
    var placed = [];
    var rightLimit = window.innerWidth - (panelOpen ? 344 : 8);
    notes.forEach(function (note) {
      if (!onThisView(note)) return;
      var el = findAnchor(note.anchor);
      if (!el) return;
      var r = el.getBoundingClientRect();
      if (r.bottom < topBar || r.top > window.innerHeight) return;
      var strong = openRef === note.ref || captureRef === note.ref;
      outlines += '<div class="outline' + (strong ? " is-strong" : "") + '" style="left:' + (r.left - 3) + "px;top:" + (r.top - 3) + "px;width:" + (r.width + 6) + "px;height:" + (r.height + 6) + 'px"></div>';
      // Chips sit just above the component's top-left corner. Several on one component line up side by side.
      var x = Math.max(8, r.left - 3);
      var y = Math.max(topBar + 26, r.top - 6);
      placed.forEach(function (p) {
        if (Math.abs(p.y - y) < 24 && x < p.x + p.w + 6 && x + 120 > p.x) x = p.x + p.w + 6;
      });
      var w = Math.min(220, 40 + note.title.length * 6.2);
      x = Math.min(x, rightLimit - w);
      placed.push({ x: x, y: y, w: w });
      chips += chipHtml(note, x, y);
    });
    els.outlines.innerHTML = outlines;
    els.chips.innerHTML = chips;
    // Annotate mode: solid blue box and a label on whatever is under the pointer.
    if (picking && hoverEl) {
      var hr = hoverEl.getBoundingClientRect();
      els.pick.hidden = false;
      els.pick.style.cssText = "left:" + (hr.left - 3) + "px;top:" + (hr.top - 3) + "px;width:" + (hr.width + 6) + "px;height:" + (hr.height + 6) + "px";
      els.pick.innerHTML = '<span class="pick-label">' + esc(anchorFrom(hoverEl).label) + "</span>";
    } else els.pick.hidden = true;
    placeCard();
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

  // The open card (or editor) sits beside its component, joined by a dashed leader line.
  function placeCard() {
    var card = els.card.firstElementChild;
    if (!card) {
      els.leader.innerHTML = "";
      return;
    }
    var note = editor ? editor.note : findNote(openRef);
    var anchor = editor ? editor.anchor : note && note.anchor;
    var el = anchor && onThisView({ anchor: anchor }) ? findAnchor(anchor) : null;
    var cw = card.offsetWidth;
    var ch = card.offsetHeight;
    var vw = window.innerWidth - (panelOpen ? 344 : 0);
    var vh = window.innerHeight;
    var top = topOffset() + 8;
    var x, y, line = null;
    if (el) {
      var r = el.getBoundingClientRect();
      var gap = 36;
      if (r.right + gap + cw < vw - 8) {
        x = r.right + gap;
        y = Math.min(Math.max(top, r.top), vh - ch - 8);
        line = [r.right + 3, y + 20, x, y + 20];
      } else if (r.left - gap - cw > 8) {
        x = r.left - gap - cw;
        y = Math.min(Math.max(top, r.top), vh - ch - 8);
        line = [r.left - 3, y + 20, x + cw, y + 20];
      } else {
        x = Math.min(Math.max(8, r.left), vw - cw - 8);
        y = r.bottom + gap + ch < vh ? r.bottom + gap : Math.max(top, r.top - gap - ch);
        var below = y > r.bottom;
        line = [x + 24, below ? r.bottom + 3 : r.top - 3, x + 24, below ? y : y + ch];
      }
      // Keep the leader attached to the component when the card is clamped away from it.
      if (line && line[1] !== line[3] && line[0] !== line[2]) line[1] = Math.min(Math.max(line[1], r.top + 8), r.bottom - 8);
    } else {
      x = Math.max(8, vw - cw - 16);
      y = top + 8;
    }
    card.style.left = x + "px";
    card.style.top = Math.max(top, y) + "px";
    els.leader.innerHTML = line
      ? '<line x1="' + line[0] + '" y1="' + line[1] + '" x2="' + line[2] + '" y2="' + line[3] + '" stroke="' + BLUE + '" stroke-width="1.5" stroke-dasharray="4 3"/><circle cx="' + line[0] + '" cy="' + line[1] + '" r="3" fill="' + BLUE + '"/>'
      : "";
  }

  function tagHtml(note) {
    var c = categoryOf(note.category);
    return c ? '<span class="tag" style="--c:' + c.colour + '">' + esc(c.label) + "</span>" : '<span class="tag none">No category</span>';
  }
  function renderCard() {
    if (editor) return renderEditor();
    var note = findNote(openRef);
    if (!note) {
      els.card.innerHTML = "";
      return;
    }
    els.card.innerHTML =
      '<div class="card" role="dialog" aria-label="Note ' + note.ref + '">' +
      '<div class="card-head">' + tagHtml(note) + '<span class="kind">' + esc(kindOf(note.kind).label) + '</span><span class="sp"></span><span class="kind">#' + note.ref + '</span><button type="button" class="ico" data-a="close-card" aria-label="Close">✕</button></div>' +
      "<h3>" + esc(note.title) + '</h3><div class="where">' + esc(whereText(note)) + "</div>" +
      (note.body ? '<div class="body">' + md(note.body) + "</div>" : "") +
      '<div class="meta"><span>' + esc(note.author || "Unknown") + "</span><span>" + esc(note.updatedAt || note.createdAt || "") + "</span><span>" + esc(note.hold && !note.handover ? "On hold" : handoverName(note.handover)) + "</span></div>" +
      '<div class="acts">' +
      (editable ? '<button type="button" class="btn" data-a="edit" data-ref="' + note.ref + '">Edit</button>' : "") +
      '<button type="button" class="btn" data-a="copy" data-ref="' + note.ref + '">Copy as ticket</button>' +
      (editable && !note.handover ? '<button type="button" class="btn ghost" data-a="hold" data-ref="' + note.ref + '">' + (note.hold ? "Include in next handover" : "Hold back") + "</button>" : "") +
      (editable ? '<button type="button" class="btn ghost danger" data-a="delete" data-ref="' + note.ref + '">Delete</button>' : "") +
      "</div></div>";
  }
  function renderEditor() {
    var d = editor.draft;
    var c = categoryOf(d.category);
    var editing = Boolean(editor.note);
    var handovers =
      '<option value="">Next handover</option>' +
      data.handovers.slice().reverse().map(function (ho) { return '<option value="' + esc(ho.id) + '"' + (d.handover === ho.id ? " selected" : "") + ">" + esc(ho.name) + "</option>"; }).join("");
    var catMenu =
      menu === "category"
        ? '<div class="menu" role="menu"><button type="button" role="menuitemradio" aria-checked="' + !d.category + '" data-a="set-cat" data-key=""><span class="tick">' + (!d.category ? "✓" : "") + "</span>No category</button><hr>" +
          data.categories.map(function (cat) { return '<button type="button" role="menuitemradio" aria-checked="' + (d.category === cat.key) + '" data-a="set-cat" data-key="' + esc(cat.key) + '"><span class="tick">' + (d.category === cat.key ? "✓" : "") + '</span><span class="sw" style="background:' + cat.colour + '"></span>' + esc(cat.label) + "</button>"; }).join("") +
          '<hr><button type="button" role="menuitem" data-a="edit-cats"><span class="tick"></span>Edit categories…</button></div>'
        : "";
    var kindMenu =
      menu === "kind"
        ? '<div class="menu" role="menu">' + KINDS.map(function (k) { return '<button type="button" role="menuitemradio" aria-checked="' + (d.kind === k.key) + '" data-a="set-kind" data-key="' + k.key + '"><span class="tick">' + (d.kind === k.key ? "✓" : "") + "</span><span>" + k.label + '<span class="sub">' + k.help + "</span></span></button>"; }).join("") + "</div>"
        : "";
    var moreMenu =
      menu === "more"
        ? '<div class="menu right" role="menu">' + (editing ? '<button type="button" role="menuitem" data-a="delete" data-ref="' + editor.note.ref + '"><span class="tick"></span>Delete note</button>' : "") + '<button type="button" role="menuitem" data-a="repick"><span class="tick"></span>Attach to another component</button></div>'
        : "";
    els.card.innerHTML =
      '<form class="card editor" role="dialog" aria-label="' + (editing ? "Edit note " + editor.note.ref : "New note") + '" data-form="note">' +
      '<div class="card-head">' +
      '<span class="menu-wrap"><button type="button" class="sel tagsel' + (c ? "" : " none") + '" style="--c:' + (c ? c.colour : "transparent") + '" data-a="menu" data-menu="category" aria-haspopup="menu" aria-expanded="' + (menu === "category") + '">' + esc(c ? c.label : "No category") + ' <span class="caret">▼</span></button>' + catMenu + "</span>" +
      '<span class="menu-wrap"><button type="button" class="sel" data-a="menu" data-menu="kind" aria-haspopup="menu" aria-expanded="' + (menu === "kind") + '">' + esc(kindOf(d.kind).label) + ' <span class="caret">▼</span></button>' + kindMenu + "</span>" +
      '<span class="sp"></span><span class="menu-wrap"><button type="button" class="ico" data-a="menu" data-menu="more" aria-label="More" aria-haspopup="menu" aria-expanded="' + (menu === "more") + '">•••</button>' + moreMenu + "</span>" +
      '<button type="button" class="ico" data-a="close-card" aria-label="Cancel">✕</button></div>' +
      '<div class="where">' + esc(editor.anchor ? whereText({ anchor: editor.anchor }) : "Applies everywhere") + "</div>" +
      '<input class="title-in" id="hl-title" name="title" maxlength="120" placeholder="Title" value="' + esc(d.title) + '" aria-label="Title" autocomplete="off">' +
      '<textarea class="body-in" id="hl-body" name="body" placeholder="Describe what it does, how it behaves and anything developers should know" aria-label="Description">' + esc(d.body) + "</textarea>" +
      '<div class="hint-line">Blank line for a new paragraph · "- " for bullets · **bold** · `code`</div>' +
      '<p class="err" role="alert"></p>' +
      '<div class="foot"><select class="hsel" name="handover" data-f="draft-handover" aria-label="Handover">' + handovers + '</select><span class="sp"></span><button type="button" class="btn ghost" data-a="close-card">Cancel</button><button type="submit" class="btn pri">' + (editing ? "Save" : "Add note") + "</button></div>" +
      "</form>";
    var form = els.card.querySelector("form");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      saveEditor();
    });
    form.querySelector("#hl-body").addEventListener("keydown", function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") saveEditor();
    });
  }
  function renderPanel() {
    if (!panelOpen) {
      els.panel.hidden = true;
      return;
    }
    els.panel.hidden = false;
    var notes = visibleNotes();
    var held = notes.filter(function (n) { return n.hold && !n.handover; });
    var live = notes.filter(function (n) { return !(n.hold && !n.handover); });
    var here = live.filter(function (n) { return n.anchor && onThisView(n); });
    var global = live.filter(function (n) { return !n.anchor; });
    var elsewhere = live.filter(function (n) { return n.anchor && !onThisView(n); });
    var opts =
      '<option value="next"' + (filter.handover === "next" ? " selected" : "") + ">Next handover</option>" +
      data.handovers.slice().reverse().map(function (ho) { return '<option value="' + esc(ho.id) + '"' + (filter.handover === ho.id ? " selected" : "") + ">" + esc(ho.name) + "</option>"; }).join("") +
      '<option value="all"' + (filter.handover === "all" ? " selected" : "") + ">All notes</option>";
    var item = function (n) {
      return '<button type="button" class="item' + (openRef === n.ref ? " is-open" : "") + '" data-a="open" data-ref="' + n.ref + '"><span class="top"><span class="dot" style="background:' + noteColour(n) + '"></span><span class="n">' + n.ref + '</span><span class="ti">' + esc(n.title) + '</span></span><span class="where">' + esc(kindOf(n.kind).label) + " · " + esc(whereText(n)) + "</span></button>";
    };
    var group = function (title, list) {
      return list.length ? '<p class="group">' + title + " · " + list.length + "</p>" + list.map(item).join("") : "";
    };
    var chipsF =
      '<button type="button" class="pf" data-a="cat-filter" data-key="all" aria-pressed="' + (filter.category === "all") + '">All</button>' +
      data.categories.map(function (c) { return '<button type="button" class="pf" data-a="cat-filter" data-key="' + esc(c.key) + '" aria-pressed="' + (filter.category === c.key) + '"><span class="sw" style="background:' + c.colour + '"></span>' + esc(c.label) + "</button>"; }).join("") +
      '<button type="button" class="pf" data-a="cat-filter" data-key="none" aria-pressed="' + (filter.category === "none") + '">No category</button>';
    els.panel.innerHTML =
      '<header><div class="row"><div class="sp"><h2>Notes</h2><p class="sub">' + esc(viewLabel(currentView())) + '</p></div><select class="hsel" data-f="handover" aria-label="Handover">' + opts + '</select><button type="button" class="ico" data-a="panel" aria-label="Close list">✕</button></div>' +
      '<div class="filters">' + chipsF + "</div>" +
      (editable ? "" : '<p class="readonly">View only. Notes are edited when the prototype runs locally.</p>') +
      "</header>" +
      '<div class="list">' +
      (notes.length ? group("On this page", here) + group("Everywhere", global) + group("Elsewhere", elsewhere) + group("On hold", held) : '<div class="empty">No notes here yet.' + (editable ? "<br>Choose + Annotate and click a component." : "") + "</div>") +
      "</div>" +
      (editable ? '<div class="pfoot"><button type="button" class="btn" data-a="new-page">Note on this page</button><button type="button" class="btn" data-a="new-global">Global note</button><span class="sp"></span><button type="button" class="btn ghost" data-a="profile">' + esc((profile() || {}).name || "Your name") + "</button></div>" : "");
  }
  function render() {
    renderTools();
    renderPanel();
    renderCard();
    schedule();
  }
  function toast(message) {
    els.toast.textContent = message;
    els.toast.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(function () {
      els.toast.hidden = true;
    }, 3000);
  }
  function hint(message) {
    els.hint.textContent = message || "";
    els.hint.hidden = !message;
  }

  // ---------- Writing notes ----------
  function openEditor(note, anchor) {
    if (!profile()) return openProfile(function () { openEditor(note, anchor); });
    openRef = null;
    menu = null;
    editor = {
      note: note,
      anchor: note ? note.anchor : anchor,
      draft: note
        ? { title: note.title, body: note.body || "", kind: note.kind, category: note.category || "", handover: note.handover || "" }
        : { title: "", body: "", kind: anchor ? "feature" : "global", category: "", handover: "" },
    };
    render();
    setTimeout(function () {
      var t = els.card.querySelector("#hl-title");
      if (t) t.focus();
    }, 20);
  }
  function saveEditor() {
    var form = els.card.querySelector("form");
    if (!form || !editor) return;
    var d = editor.draft;
    d.title = form.querySelector("#hl-title").value.trim();
    d.body = form.querySelector("#hl-body").value.trim();
    if (!d.title) {
      form.querySelector(".err").textContent = "Add a title so the note can be found later.";
      form.querySelector("#hl-title").focus();
      return;
    }
    var p = profile() || {};
    var now = today();
    var target = editor.note || { id: "n-" + Date.now().toString(36), ref: data.nextRef++, type: "annotation", anchor: editor.anchor, author: p.name, createdAt: now };
    target.title = d.title;
    target.body = d.body;
    target.kind = d.kind;
    target.category = d.category || null;
    target.handover = d.handover || null;
    target.anchor = editor.anchor;
    target.updatedAt = now;
    if (editor.note) target.editedBy = p.name;
    else data.notes.push(target);
    var wasEditing = Boolean(editor.note);
    editor = null;
    menu = null;
    openRef = target.ref;
    render();
    persist().then(function (ok) {
      if (ok) toast(wasEditing ? "Note " + target.ref + " saved" : "Note " + target.ref + " added");
    });
  }
  function syncDraft() {
    if (!editor) return;
    var t = els.card.querySelector("#hl-title");
    var b = els.card.querySelector("#hl-body");
    if (t) editor.draft.title = t.value;
    if (b) editor.draft.body = b.value;
  }
  function openProfile(next) {
    var p = profile() || { name: "", role: "" };
    els.dialog.innerHTML =
      '<div class="scrim" data-a="scrim"><form class="dialog" role="dialog" aria-modal="true" aria-labelledby="hl-pr-title">' +
      '<h2 id="hl-pr-title">Who\'s writing these notes?</h2><p>Your name goes on each note. It\'s saved in this browser only.</p>' +
      '<div class="field"><label for="hl-name">Name</label><input id="hl-name" name="name" required value="' + esc(p.name) + '" autocomplete="name"></div>' +
      '<div class="field"><label for="hl-role">Role (optional)</label><input id="hl-role" name="role" value="' + esc(p.role) + '" placeholder="For example, Product designer"></div>' +
      '<div class="dlg-acts"><span class="sp"></span><button type="button" class="btn ghost" data-a="close-dialog">Cancel</button><button type="submit" class="btn pri">Save</button></div></form></div>';
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
  function openCategories() {
    syncDraft();
    menu = null;
    var draft = data.categories.map(function (c) { return { key: c.key, label: c.label, colour: c.colour }; });
    var paint = function () {
      els.dialog.innerHTML =
        '<div class="scrim" data-a="scrim"><form class="dialog" role="dialog" aria-modal="true" aria-labelledby="hl-cat-title">' +
        '<h2 id="hl-cat-title">Categories</h2><p>Shared by everyone writing notes on this prototype.</p>' +
        draft.map(function (c, i) {
          return '<div class="cat-row"><button type="button" class="swatch" data-a="cat-colour" data-i="' + i + '" style="background:' + c.colour + '" aria-label="Change colour for ' + esc(c.label || "category") + '"></button><input data-i="' + i + '" value="' + esc(c.label) + '" aria-label="Category name" placeholder="Name"><button type="button" class="ico" data-a="cat-remove" data-i="' + i + '" aria-label="Remove ' + esc(c.label) + '">✕</button></div>';
        }).join("") +
        '<div class="dlg-acts"><button type="button" class="btn ghost" data-a="cat-add">+ Add category</button><span class="sp"></span><button type="button" class="btn ghost" data-a="close-dialog">Cancel</button><button type="submit" class="btn pri">Save</button></div></form></div>';
      var form = els.dialog.querySelector("form");
      form.querySelectorAll("input[data-i]").forEach(function (input) {
        input.addEventListener("input", function () {
          draft[Number(input.getAttribute("data-i"))].label = input.value;
        });
      });
      form.addEventListener("click", function (e) {
        var t = e.target.closest("[data-a]");
        if (!t) return;
        var i = Number(t.getAttribute("data-i"));
        var a = t.getAttribute("data-a");
        if (a === "cat-colour") {
          draft[i].colour = PALETTE[(PALETTE.indexOf(draft[i].colour) + 1) % PALETTE.length];
          paint();
          form = els.dialog.querySelector("form");
          form.querySelector('[data-a="cat-colour"][data-i="' + i + '"]').focus();
        } else if (a === "cat-remove") {
          draft.splice(i, 1);
          paint();
        } else if (a === "cat-add") {
          draft.push({ key: "", label: "", colour: PALETTE[draft.length % PALETTE.length] });
          paint();
          var inputs = els.dialog.querySelectorAll("input[data-i]");
          inputs[inputs.length - 1].focus();
        }
      });
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var used = {};
        data.categories = draft
          .filter(function (c) { return c.label.trim(); })
          .map(function (c) {
            var key = c.key || c.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
            while (used[key]) key += "-2";
            used[key] = true;
            return { key: key, label: c.label.trim(), colour: c.colour };
          });
        data.notes.forEach(function (n) {
          if (n.category && !categoryOf(n.category)) n.category = null;
        });
        if (editor && editor.draft.category && !categoryOf(editor.draft.category)) editor.draft.category = "";
        closeDialog();
        render();
        persist().then(function (ok) {
          if (ok) toast("Categories saved");
        });
      });
    };
    paint();
  }
  function closeDialog() {
    els.dialog.innerHTML = "";
  }
  function confirmDelete(ref) {
    var note = findNote(ref);
    if (!note) return;
    menu = null;
    els.dialog.innerHTML =
      '<div class="scrim" data-a="scrim"><div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="hl-del"><h2 id="hl-del">Delete note ' + ref + "?</h2><p>" + esc(note.title) + '</p><div class="dlg-acts"><span class="sp"></span><button type="button" class="btn ghost" data-a="close-dialog">Cancel</button><button type="button" class="btn pri" style="background:#d93025" data-a="delete-now" data-ref="' + ref + '">Delete</button></div></div></div>';
    els.dialog.querySelector('[data-a="delete-now"]').focus();
  }

  // ---------- Moving between notes ----------
  function goToNote(note) {
    openRef = note.ref;
    editor = null;
    var needsNav = note.anchor && note.anchor.view && note.anchor.view !== currentView();
    var nav = needsNav && cfg.goTo ? Promise.resolve(cfg.goTo(note.anchor.view)) : Promise.resolve();
    return nav
      .then(function () {
        return new Promise(function (resolve) { setTimeout(resolve, needsNav ? 320 : 0); });
      })
      .then(function () {
        // Screenshots always reveal, so menus and dialog steps show even when their trigger is on screen.
        if (cfg.reveal && note.anchor && (captureRef != null || !findAnchor(note.anchor)))
          return Promise.resolve(cfg.reveal(note.anchor)).then(function () { return new Promise(function (r) { setTimeout(r, 320); }); });
      })
      .then(function () {
        var el = findAnchor(note.anchor);
        if (el) {
          var r = el.getBoundingClientRect();
          var room = window.innerHeight - topOffset() - 80;
          if (r.height > room && r.top + window.scrollY < window.innerHeight * 0.6) {
            // Big and near the top of the page: show the page from the top, heading included.
            window.scrollTo(0, 0);
          } else if (r.height > room) {
            // Taller than the screen: line its top up just under the fixed bars.
            el.style.scrollMarginTop = topOffset() + 24 + "px";
            el.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
          } else if (r.top < topOffset() + 40 || r.bottom > window.innerHeight - 40) el.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
        }
        render();
        return el;
      });
  }
  function ticketText(note) {
    var url = location.origin + location.pathname + "#hl=" + note.ref;
    var c = categoryOf(note.category);
    return "[#" + note.ref + "] " + note.title + "\n\nType: " + kindOf(note.kind).label + (c ? " · " + c.label : "") + " · " + handoverName(note.handover) + "\nWhere: " + whereText(note) + (note.anchor && note.anchor.spec ? " (" + note.anchor.spec + ")" : "") + "\n\n" + (note.body || "") + "\n\nPrototype: " + url;
  }

  // ---------- Events ----------
  function setOn(value) {
    on = value;
    if (!on) {
      stopPicking(true);
      panelOpen = false;
      openRef = null;
      editor = null;
      menu = null;
    }
    render();
    if (on) loop();
  }
  function startPicking() {
    if (!profile()) return openProfile(startPicking);
    picking = true;
    editor = null;
    openRef = null;
    hint("Click a component to annotate it · Esc to cancel");
    render();
  }
  function stopPicking(quiet) {
    picking = false;
    hoverEl = null;
    hint("");
    if (!quiet) render();
  }
  function onClick(e) {
    var t = e.target.closest("[data-a]");
    if (menu && (!t || !/^(menu|set-cat|set-kind|edit-cats|repick|delete)$/.test(t.getAttribute("data-a")))) {
      menu = null;
      syncDraft();
      renderCard();
      schedule();
    }
    if (!t) return;
    var a = t.getAttribute("data-a");
    var ref = Number(t.getAttribute("data-ref"));
    var note = findNote(ref);
    if (a === "scrim" && e.target !== t) return;
    if (a === "toggle") setOn(!on);
    else if (a === "pick") picking ? stopPicking() : startPicking();
    else if (a === "panel") {
      panelOpen = !panelOpen;
      render();
    } else if (a === "cat-filter") {
      filter.category = t.getAttribute("data-key");
      render();
    } else if (a === "open" && note) {
      if (openRef === ref && !editor && e.target.closest(".chip")) {
        openRef = null;
        render();
      } else goToNote(note);
    } else if (a === "close-card") {
      editor = null;
      openRef = null;
      menu = null;
      render();
    } else if (a === "edit" && note) openEditor(note);
    else if (a === "menu") {
      syncDraft();
      var which = t.getAttribute("data-menu");
      menu = menu === which ? null : which;
      renderCard();
      schedule();
      var first = els.card.querySelector(".menu button");
      if (first) first.focus();
    } else if (a === "set-cat") {
      syncDraft();
      editor.draft.category = t.getAttribute("data-key");
      menu = null;
      renderCard();
      schedule();
    } else if (a === "set-kind") {
      syncDraft();
      editor.draft.kind = t.getAttribute("data-key");
      menu = null;
      renderCard();
      schedule();
    } else if (a === "edit-cats") openCategories();
    else if (a === "repick") {
      syncDraft();
      var keep = editor;
      menu = null;
      editor = null;
      render();
      picking = true;
      hint("Click the component this note should attach to · Esc to cancel");
      repickFor = keep;
    } else if (a === "hold" && note) {
      note.hold = !note.hold;
      if (!note.hold) delete note.hold;
      render();
      persist().then(function (ok) {
        if (ok) toast(note.hold ? "Note " + ref + " held back from the next handover" : "Note " + ref + " included in the next handover");
      });
    } else if (a === "delete") confirmDelete(ref);
    else if (a === "delete-now") {
      data.notes = data.notes.filter(function (n) { return n.ref !== ref; });
      if (openRef === ref) openRef = null;
      editor = null;
      closeDialog();
      render();
      persist().then(function (ok) {
        if (ok) toast("Note " + ref + " deleted");
      });
    } else if (a === "copy" && note) {
      var text = ticketText(note);
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
        .then(function () { toast("Copied, ready to paste into a ticket"); })
        .catch(function () { window.prompt("Copy this text", text); });
    } else if (a === "close-dialog" || a === "scrim") closeDialog();
    else if (a === "new-page") openEditor(null, { view: currentView(), label: "Page" });
    else if (a === "new-global") openEditor(null, null);
    else if (a === "profile") openProfile();
  }
  var repickFor = null;
  function onChange(e) {
    var f = e.target.getAttribute("data-f");
    if (f === "handover") {
      filter.handover = e.target.value;
      openRef = null;
      render();
    } else if (f === "draft-handover" && editor) editor.draft.handover = e.target.value;
  }
  function onInput() {
    if (editor) syncDraft();
  }
  function pathTarget(e) {
    var path = e.composedPath ? e.composedPath() : [e.target];
    if (path.indexOf(root) !== -1 || (toolsHost && path.indexOf(toolsHost) !== -1)) return null;
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
        if (type !== "click") return;
        var anchor = anchorFrom(t.closest("[data-spec]") || t);
        stopPicking(true);
        if (repickFor) {
          editor = repickFor;
          editor.anchor = anchor;
          repickFor = null;
          render();
        } else openEditor(null, anchor);
      },
      true,
    );
  });
  window.addEventListener(
    "keydown",
    function (e) {
      var origin = (e.composedPath && e.composedPath()[0]) || e.target;
      var typing = /^(input|textarea|select)$/i.test(origin.tagName || "") || origin.isContentEditable;
      if (e.altKey && e.code === "KeyH" && !typing) {
        e.preventDefault();
        setOn(!on);
      } else if (on && e.altKey && e.code === "KeyN" && editable && !typing) {
        e.preventDefault();
        startPicking();
      } else if (e.key === "Escape" && (picking || els.dialog.innerHTML || menu || editor || openRef != null)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (els.dialog.innerHTML) closeDialog();
        else if (menu) {
          menu = null;
          syncDraft();
          renderCard();
          schedule();
        } else if (picking) {
          stopPicking();
          if (repickFor) {
            editor = repickFor;
            repickFor = null;
            render();
          }
        } else {
          editor = null;
          openRef = null;
          render();
        }
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
    var note = findNote(Number(m[1]));
    if (!note) return;
    filter.handover = note.handover || "next";
    if (!on) setOn(true);
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
      var note = findNote(ref);
      if (!note) return Promise.resolve(null);
      captureRef = ref;
      on = true;
      panelOpen = false;
      els.tools.style.visibility = "hidden";
      return goToNote(note).then(function (el) {
        openRef = null;
        els.card.innerHTML = "";
        paint();
        if (!el) return { found: false };
        // Include anything that pops out of the anchor, such as an open menu.
        var r = el.getBoundingClientRect();
        var box = { l: r.left, t: r.top, r: r.right, b: r.bottom };
        el.querySelectorAll("*").forEach(function (child) {
          var c = child.getBoundingClientRect();
          if (!c.width || !c.height) return;
          box.l = Math.min(box.l, c.left); box.t = Math.min(box.t, c.top);
          box.r = Math.max(box.r, c.right); box.b = Math.max(box.b, c.bottom);
        });
        var out = { found: true, x: box.l, y: box.t, width: box.r - box.l, height: box.b - box.t };
        // Inside a dialog: give the whole dialog as the frame, for context.
        var dialog = el.closest("dialog[open]");
        if (dialog) {
          var d = dialog.getBoundingClientRect();
          out.frame = { x: d.left, y: d.top, width: d.width, height: d.height };
        }
        return out;
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
