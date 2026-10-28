// ---------- Motion: screen and dialog entrances ----------
// Every store change re-renders the whole page, so entrances run only on a real screen change or when a
// dialog opens or moves to a new step, never on ordinary re-renders (typing, selecting, filtering).
// Rendering stays synchronous: the old page is copied into a fading overlay while the new one staggers in
// underneath, so code that navigates and then reaches for the new DOM keeps working.
// Reduced-motion users get none of it (styles.css switches animations off; the overlay is skipped here).
const REDUCED_MOTION = matchMedia("(prefers-reduced-motion: reduce)");
const SECTION_STEP = 45; // ms between page sections
const ROW_STEP = 18; // ms between table rows
const ROW_CAP = 12; // rows past this arrive together, so long tables don't drag
const PAGE_DELAY = 90; // let the old page mostly fade before the new one rises

// Snapshots of the outgoing page or dialog must stay frozen: copied entrance classes would replay
// from opacity 0 and blank the copy instead of letting it fade.
function freezeCopy(root) {
  root.querySelectorAll(".motion-in, .motion-row").forEach((el) => {
    el.classList.remove("motion-in", "motion-row");
    el.style.removeProperty("--motion-delay");
  });
}

// A lone wrapper (a form, a grid) would animate as one block; step inside it so its parts stagger.
function staggerTargets(root) {
  let node = root;
  for (let depth = 0; depth < 3; depth++) {
    const kids = [...node.children].filter((el) => el.getClientRects().length);
    if (kids.length !== 1 || kids[0].matches("table,.table-wrap,section,.card")) return kids;
    node = kids[0];
  }
  return [...node.children].filter((el) => el.getClientRects().length);
}

// Returns the delay the next block should start at.
function staggerIn(root, start) {
  let delay = start;
  for (const block of staggerTargets(root)) {
    block.classList.add("motion-in");
    block.style.setProperty("--motion-delay", `${delay}ms`);
    block.querySelectorAll("tbody > tr").forEach((tr, i) => {
      tr.classList.add("motion-row");
      tr.style.setProperty("--motion-delay", `${delay + 60 + Math.min(i, ROW_CAP) * ROW_STEP}ms`);
    });
    delay += SECTION_STEP;
  }
  return delay;
}

function ghostOutgoingPage() {
  const main = document.getElementById("main");
  if (!main) return;
  const r = main.getBoundingClientRect();
  const top = Math.max(r.top, 0);
  const bottom = Math.min(r.bottom, innerHeight);
  if (bottom <= top) return;
  const frame = document.createElement("div");
  frame.className = "motion-ghost";
  frame.setAttribute("aria-hidden", "true");
  frame.inert = true;
  Object.assign(frame.style, { top: `${top}px`, left: `${r.left}px`, width: `${r.width}px`, height: `${bottom - top}px` });
  const copy = main.cloneNode(true);
  copy.removeAttribute("id");
  copy.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
  freezeCopy(copy);
  Object.assign(copy.style, { margin: "0", width: `${r.width}px`, minHeight: "0", transform: `translateY(${r.top - top}px)` });
  frame.append(copy);
  document.body.append(frame);
  const remove = () => frame.remove();
  frame.addEventListener("animationend", (e) => e.target === frame && remove());
  setTimeout(remove, 400);
}

const motionBaseNavigate = navigate;
navigate = function (view) {
  const animate = view !== state.view && !REDUCED_MOTION.matches;
  if (animate) ghostOutgoingPage();
  motionBaseNavigate(view);
  const main = document.getElementById("main");
  if (animate && main) staggerIn(main, PAGE_DELAY);
};

// ---------- Dialogs ----------
// Open: the backdrop fades in, the dialog rises gently, then its header, body sections and footer stagger in.
// A new step (title change) re-staggers the content only. Progress updates that keep the title, such as
// the CSV check, stay still. Everything is kept short because dialogs open constantly in this product.
const DIALOG_START = 40; // content starts while the dialog is still settling
const DIALOG_STEP = 30; // ms between dialog sections
const DIALOG_CAP = 150; // long forms: sections past this arrive together
const DIALOG_ROW_STEP = 12;

function staggerDialog(modal, start) {
  const header = modal.querySelector(".modal-header");
  const body = modal.querySelector(".modal-body");
  const footer = modal.querySelector(".modal-footer");
  const mark = (el, delay) => {
    el.classList.add("motion-in");
    el.style.setProperty("--motion-delay", `${Math.min(delay, start + DIALOG_CAP)}ms`);
  };
  let delay = start;
  if (header) mark(header, delay), (delay += DIALOG_STEP);
  if (body)
    for (const block of staggerTargets(body)) {
      mark(block, delay);
      block.querySelectorAll("tbody > tr").forEach((tr, i) => {
        tr.classList.add("motion-row");
        tr.style.setProperty("--motion-delay", `${Math.min(delay, start + DIALOG_CAP) + 40 + Math.min(i, ROW_CAP) * DIALOG_ROW_STEP}ms`);
      });
      delay += DIALOG_STEP;
    }
  if (footer) mark(footer, delay);
}

// Close: dialogs are closed synchronously from many places, so instead of delaying close() the dialog is
// copied into a fading overlay at the moment it closes. If another dialog opens in the same tick (closing one
// to open the next), no overlay is shown and the next one treats it as a step change, so the backdrop never
// flickers off and on.
var motionModalTitle = "";
var motionClosedAt = -Infinity;
const modalEl = $("#modal");
const nativeModalClose = modalEl.close.bind(modalEl);
modalEl.close = function (...args) {
  if (!modalEl.open || REDUCED_MOTION.matches) return nativeModalClose(...args);
  const rect = modalEl.getBoundingClientRect();
  const look = getComputedStyle(modalEl);
  const snapshot = { html: modalEl.innerHTML, className: modalEl.className, rect, background: look.backgroundColor, radius: look.borderRadius, shadow: look.boxShadow };
  nativeModalClose(...args);
  motionClosedAt = performance.now();
  queueMicrotask(() => {
    if (!modalEl.open) ghostClosedDialog(snapshot);
  });
};

function ghostClosedDialog({ html, className, rect, background, radius, shadow }) {
  const layer = document.createElement("div");
  layer.className = "motion-dialog-ghost";
  layer.setAttribute("aria-hidden", "true");
  layer.inert = true;
  const box = document.createElement("div");
  box.className = className;
  box.innerHTML = html;
  box.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
  freezeCopy(box);
  box.classList.remove("motion-dialog");
  Object.assign(box.style, {
    position: "fixed", top: `${rect.top}px`, left: `${rect.left}px`, width: `${rect.width}px`, height: `${rect.height}px`,
    margin: "0", display: "flex", flexDirection: "column", overflow: "hidden", boxSizing: "border-box",
    background, borderRadius: radius, boxShadow: shadow,
  });
  box.classList.add("motion-dialog-ghost-box");
  box.setAttribute("aria-hidden", "true");
  box.inert = true;
  // Siblings, not nested, so the dialog's fade isn't multiplied by the backdrop's.
  document.body.append(layer, box);
  const remove = () => (layer.remove(), box.remove());
  layer.addEventListener("animationend", (e) => e.target === layer && remove());
  setTimeout(remove, 300);
}

// Some flows render the same dialog twice in one go (Add students does), and each render rewrites the
// dialog's classes and content. A re-render in the same instant as an entrance therefore replays that
// entrance rather than cancelling it; it hasn't been painted yet, so nothing visibly restarts.
var motionEntrance = { at: -Infinity, opening: false };
const motionBaseOpenModal = openModal;
openModal = function (...args) {
  const wasOpen = modalEl.open;
  const now = performance.now();
  const swapped = !wasOpen && now - motionClosedAt < 50;
  const result = motionBaseOpenModal(...args);
  const title = String(args[0] ?? "");
  const sameInstant = wasOpen && now - motionEntrance.at < 16;
  if (!REDUCED_MOTION.matches && (!wasOpen || title !== motionModalTitle || sameInstant)) {
    const opening = sameInstant ? motionEntrance.opening : !wasOpen && !swapped;
    if (opening) modalEl.classList.add("motion-dialog");
    staggerDialog(modalEl, opening ? DIALOG_START : 0);
    if (!sameInstant) motionEntrance = { at: now, opening };
  }
  motionModalTitle = title;
  return result;
};
modalEl.addEventListener("close", () => {
  if (!modalEl.open) motionModalTitle = "";
});

// ---------- Sidebar: the active bar slides to the new tab ----------
// The whole sidebar is rebuilt on every render, so the bar is a single element re-placed after each one.
// When the active tab changes it starts where the old bar was and slides to the new tab.
var navBar = { top: null, height: null, key: "" };
function placeNavBar() {
  const sidebar = document.querySelector(".sidebar");
  if (!sidebar) return;
  const active = sidebar.querySelector(".nav-btn.active");
  let bar = sidebar.querySelector(".nav-indicator");
  if (!bar) {
    bar = document.createElement("span");
    bar.className = "nav-indicator";
    bar.setAttribute("aria-hidden", "true");
    sidebar.prepend(bar);
    sidebar.classList.add("has-nav-indicator");
  }
  if (!active) {
    bar.style.opacity = "0";
    navBar = { top: null, height: null, key: "" };
    return;
  }
  const top = active.offsetTop;
  const height = active.offsetHeight;
  const key = active.dataset.view || active.textContent;
  const slide = navBar.top !== null && key !== navBar.key && !REDUCED_MOTION.matches;
  // The bar is a fresh element after each render: pin it to its start point (the old tab when sliding,
  // the current tab otherwise) with transitions off, then release it.
  bar.style.transition = "none";
  bar.style.transform = `translateY(${slide ? navBar.top : top}px)`;
  bar.style.height = `${slide ? navBar.height : height}px`;
  bar.style.opacity = "1";
  bar.getBoundingClientRect();
  bar.style.transition = "";
  if (slide) {
    bar.style.transform = `translateY(${top}px)`;
    bar.style.height = `${height}px`;
  }
  navBar = { top, height, key };
}
const motionBaseRender = render;
render = function (...args) {
  const result = motionBaseRender(...args);
  placeNavBar();
  return result;
};
placeNavBar();

// First load gets the same entrance as a screen change.
if (!REDUCED_MOTION.matches && document.getElementById("main")) staggerIn(document.getElementById("main"), 0);
