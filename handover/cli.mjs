#!/usr/bin/env node
// Handover tool. No dependencies; Playwright is optional (used for screenshots).
//
//   node handover/cli.mjs status                     what's waiting for the next handover
//   node handover/cli.mjs cut "Handover 2" [--summary "…"] [--no-commit]
//                                                    draw the line: assign waiting notes, commit, tag
//   node handover/cli.mjs report [next|<id>|<tag>]   write the handover document (HTML) with screenshots
//
// Settings live in handover/config.json (project name, build command, entry file, viewport, tag prefix).
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync, execSync } from "node:child_process";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const DATA = join(HERE, "data.json");
const REPORTS = join(HERE, "reports");
const KINDS = [
  ["feature", "New features", "#0e7490"],
  ["change", "Changes", "#7c3aed"],
  ["global", "Global changes", "#b45309"],
  ["fix", "Fixes", "#15803d"],
];

const config = {
  project: "Prototype",
  build: "",
  entry: "dist/index.html",
  viewport: [1440, 900],
  tagPrefix: "handover-",
  watch: ["src"],
  ...(existsSync(join(HERE, "config.json")) ? JSON.parse(await readFile(join(HERE, "config.json"), "utf8")) : {}),
};

// ---------- Helpers ----------
const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const gitOk = (...args) => {
  try {
    return git(...args);
  } catch {
    return null;
  }
};
const isRepo = () => gitOk("rev-parse", "--is-inside-work-tree") === "true";
const today = () => new Date().toISOString().slice(0, 10);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const md = (text) =>
  String(text || "")
    .trim()
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split("\n");
      const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`(.+?)`/g, "<code>$1</code>");
      if (lines.every((l) => /^\s*[-*] /.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*] /, ""))}</li>`).join("")}</ul>`;
      return `<p>${lines.map(inline).join("<br>")}</p>`;
    })
    .join("");
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
async function loadData() {
  if (!existsSync(DATA)) return { version: 1, project: config.project, nextRef: 1, handovers: [], notes: [] };
  return JSON.parse(await readFile(DATA, "utf8"));
}
async function saveData(data) {
  await writeFile(DATA, JSON.stringify(data, null, 2) + "\n");
}
function build() {
  if (!config.build) return;
  console.log(`Building: ${config.build}`);
  execSync(config.build, { cwd: ROOT, stdio: "inherit" });
}
function where(note, labels = {}) {
  if (!note.anchor) return "Applies everywhere";
  const view = labels[note.anchor.view] || note.anchor.view || "";
  return [view, note.anchor.label && note.anchor.label !== "Page" ? note.anchor.label : ""].filter(Boolean).join(" › ");
}
function flag(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1] ?? true;
}

// ---------- status ----------
async function status() {
  const data = await loadData();
  const waiting = data.notes.filter((n) => !n.handover);
  const last = data.handovers.at(-1);
  console.log(`${data.project || config.project}`);
  console.log(last ? `Last handover: ${last.name} (${last.date}${last.tag ? `, tag ${last.tag}` : ""})` : "No handovers yet. Cut a baseline to draw the first line.");
  console.log(`\nWaiting for the next handover: ${waiting.length} ${waiting.length === 1 ? "note" : "notes"}`);
  for (const [key, label] of KINDS) {
    const list = waiting.filter((n) => n.kind === key);
    if (!list.length) continue;
    console.log(`\n  ${label}`);
    for (const n of list) console.log(`    #${n.ref}  ${n.title}  ·  ${where(n, config.viewLabels)}`);
  }
  if (last?.tag && isRepo()) {
    const changed = gitOk("diff", "--name-only", last.tag, "--", ...config.watch);
    const files = changed ? changed.split("\n").filter(Boolean) : [];
    console.log(`\nFiles changed since ${last.tag}: ${files.length}`);
    files.slice(0, 20).forEach((f) => console.log(`    ${f}`));
    if (files.length && !waiting.length) console.log("\n  Code has changed but nothing is annotated yet. Add notes with the handover layer (Alt+H).");
  }
}

// ---------- cut ----------
async function cut() {
  const name = process.argv[3];
  if (!name || name.startsWith("--")) {
    console.error('Name the handover, for example: node handover/cli.mjs cut "Handover 2 · Teams"');
    process.exit(1);
  }
  const data = await loadData();
  const repo = isRepo();
  const noCommit = Boolean(flag("--no-commit")) || !repo;
  if (!noCommit) {
    const dirty = git("status", "--porcelain")
      .split("\n")
      .filter(Boolean)
      .filter((line) => !line.endsWith("handover/data.json") && !line.includes(config.entry));
    if (dirty.length && !flag("--include-all")) {
      console.error("You have uncommitted changes. Commit your design work first, so the handover marks exactly what you're handing over.\n");
      dirty.slice(0, 10).forEach((l) => console.error(`  ${l}`));
      console.error("\nOr run again with --include-all to put everything into the handover commit.");
      process.exit(1);
    }
  }
  const number = data.handovers.length + 1;
  const id = `h${number}`;
  const tag = repo ? `${config.tagPrefix}${number}` : null;
  if (tag && gitOk("rev-parse", "-q", "--verify", `refs/tags/${tag}`)) {
    console.error(`The tag ${tag} already exists. Delete it or edit handover/data.json first.`);
    process.exit(1);
  }
  const waiting = data.notes.filter((n) => !n.handover);
  waiting.forEach((n) => (n.handover = id));
  const handover = { id, name, date: today(), tag, summary: typeof flag("--summary") === "string" ? flag("--summary") : "", notes: waiting.length };
  data.handovers.push(handover);
  await saveData(data);
  build();
  if (!noCommit) {
    git("add", flag("--include-all") ? "-A" : "--", ...(flag("--include-all") ? [] : ["handover/data.json", config.entry]));
    gitOk("commit", "-m", `${name}\n\n${waiting.length} handover ${waiting.length === 1 ? "note" : "notes"}.${handover.summary ? `\n\n${handover.summary}` : ""}`);
    git("tag", "-a", tag, "-m", name);
    console.log(`\nCommitted and tagged ${tag}.`);
  }
  console.log(`${name}: ${waiting.length} ${waiting.length === 1 ? "note" : "notes"} handed over.`);
  await report(id);
}

// ---------- report ----------
async function screenshotNotes(entryHtml, data, notes) {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    try {
      ({ chromium } = createRequire(import.meta.url)("playwright"));
    } catch {}
  }
  if (!chromium) {
    console.log("\nScreenshots skipped: Playwright isn't installed. To include them, run once:\n  npm install --save-dev playwright && npx playwright install chromium\n");
    return {};
  }
  const [width, height] = config.viewport;
  const browser = await chromium.launch();
  const shots = {};
  try {
    for (const note of notes) {
      if (!note.anchor) continue;
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, reducedMotion: "reduce" });
      await context.addInitScript(`window.__HANDOVER_DATA__ = ${JSON.stringify(data).replace(/</g, "\\u003c")};`);
      const page = await context.newPage();
      try {
        await page.goto(pathToFileURL(entryHtml).href);
        await page.waitForFunction(() => window.HandoverLayer && window.HandoverLayer.capture, null, { timeout: 8000 });
        await page.waitForTimeout(300);
        const box = await page.evaluate((ref) => window.HandoverLayer.capture(ref), note.ref);
        await page.waitForTimeout(500);
        if (box?.found) {
          const pad = 48;
          const x = Math.max(0, box.x - pad);
          const y = Math.max(0, box.y - pad);
          const w = Math.min(width - x, box.width + pad * 2);
          const h = Math.min(height - y, box.height + pad * 2);
          shots[note.ref] = { data: (await page.screenshot({ clip: { x, y, width: Math.max(w, 1), height: Math.max(h, 1) } })).toString("base64"), found: true };
        } else {
          shots[note.ref] = { data: (await page.screenshot()).toString("base64"), found: false };
        }
      } catch (error) {
        console.log(`  Couldn't capture #${note.ref}: ${error.message.split("\n")[0]}`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  return shots;
}

async function report(which = process.argv[3]) {
  const data = await loadData();
  const repo = isRepo();
  let handover = null;
  let notes;
  if (!which || which === "next") {
    notes = data.notes.filter((n) => !n.handover);
    if (!notes.length && !which && data.handovers.length) handover = data.handovers.at(-1);
  } else {
    handover = data.handovers.find((h) => h.id === which || h.tag === which || slug(h.name) === slug(which));
    if (!handover) {
      console.error(`No handover called "${which}". Run status to see them.`);
      process.exit(1);
    }
  }
  if (handover) notes = data.notes.filter((n) => n.handover === handover.id);
  const index = handover ? data.handovers.indexOf(handover) : data.handovers.length;
  const previous = data.handovers[index - 1] || null;
  const title = handover ? handover.name : "Next handover (draft)";
  const fromRef = previous?.tag && repo ? previous.tag : null;
  const toRef = handover?.tag && repo ? handover.tag : null;

  // Which build to photograph: the tagged one for a past handover, the working copy for the next.
  let entry = join(ROOT, config.entry);
  let cleanup = null;
  if (toRef && toRef !== gitOk("describe", "--tags", "--exact-match")) {
    const dir = join(tmpdir(), `handover-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    entry = join(dir, "index.html");
    await writeFile(entry, git("show", `${toRef}:${config.entry}`));
    cleanup = dir;
  } else if (!handover) build();
  if (!existsSync(entry)) {
    console.error(`Can't find ${config.entry}. Check "entry" in handover/config.json.`);
    process.exit(1);
  }

  console.log(`Writing the ${title} document (${notes.length} ${notes.length === 1 ? "note" : "notes"})…`);
  const shots = await screenshotNotes(entry, data, notes);
  if (cleanup) await rm(cleanup, { recursive: true, force: true });

  // What changed in code, for context alongside the notes.
  let files = [];
  let commits = [];
  if (repo && fromRef) {
    const range = toRef ? [fromRef, toRef] : [fromRef];
    files = (gitOk("diff", "--stat=120", ...range, "--", ...config.watch) || "").split("\n").filter(Boolean);
    commits = (gitOk("log", "--format=%h %s", toRef ? `${fromRef}..${toRef}` : `${fromRef}..HEAD`) || "").split("\n").filter(Boolean);
  }

  const labels = config.viewLabels || {};
  const counts = KINDS.map(([key, label]) => {
    const n = notes.filter((note) => note.kind === key).length;
    return [n === 1 ? label.replace(/s$/, "") : label, n];
  }).filter(([, n]) => n);
  const card = (n) => {
    const k = KINDS.find(([key]) => key === n.kind) || KINDS[0];
    const shot = shots[n.ref];
    return `<article class="note" id="note-${n.ref}"><header><span class="ref">#${n.ref}</span><span class="kind" style="--c:${k[2]}">${esc(k[1].replace(/s$/, ""))}</span></header><h3>${esc(n.title)}</h3><p class="where">${esc(where(n, labels))}${n.anchor?.spec ? ` · <code>${esc(n.anchor.spec)}</code>` : ""}</p><div class="body">${md(n.body) || "<p class='muted'>No description.</p>"}</div>${shot ? `<figure><img alt="Screenshot for note ${n.ref}" src="data:image/png;base64,${shot.data}">${shot.found ? "" : `<figcaption>The component wasn't visible on this screen when captured. It may need an action to open.</figcaption>`}</figure>` : ""}<footer>${esc(n.author || "")}${n.updatedAt ? ` · ${esc(n.updatedAt)}` : ""}</footer></article>`;
  };
  const sections = KINDS.map(([key, label]) => {
    const list = notes.filter((n) => n.kind === key).sort((a, b) => a.ref - b.ref);
    return list.length ? `<section><h2>${label} <span>${list.length}</span></h2>${list.map(card).join("")}</section>` : "";
  }).join("");
  const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)} · ${esc(data.project || config.project)}</title><style>
:root{--ink:#0f172b;--muted:#5b6b82;--line:#e2e8f0;--bg:#f6f8fb;--paper:#fff;--accent:#0e7490}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 "Fira Sans",system-ui,-apple-system,"Segoe UI",sans-serif}
.wrap{max-width:980px;margin:0 auto;padding:48px max(16px,env(safe-area-inset-left)) 96px}
.eyebrow{font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--accent)}
h1{font-size:34px;line-height:1.2;margin:6px 0 8px}h2{font-size:22px;margin:48px 0 16px;padding-top:20px;border-top:1px solid var(--line)}h2 span{font-size:14px;color:var(--muted);font-weight:500}
.meta{color:var(--muted);font-size:14px}.summary{margin-top:16px;max-width:68ch}
.counts{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px;padding:0;list-style:none}.counts li{background:var(--paper);border:1px solid var(--line);border-radius:999px;padding:5px 12px;font-size:13px}
.toc{margin-top:24px;background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:16px 20px}.toc ol{margin:6px 0 0;padding-left:20px}.toc a{color:var(--ink)}
.note{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:20px 22px;margin:0 0 16px;break-inside:avoid}
.note header{display:flex;gap:8px;align-items:center}.ref{font:600 13px ui-monospace,Menlo,monospace;color:var(--muted)}
.kind{font-size:12px;font-weight:500;padding:2px 9px;border-radius:999px;color:var(--c);background:color-mix(in srgb,var(--c) 12%,#fff)}
.note h3{font-size:18px;margin:8px 0 2px}.where{margin:0;color:var(--muted);font-size:13.5px}
.body{margin-top:10px;max-width:72ch}.body p{margin:0 0 8px}.body ul{margin:0 0 8px;padding-left:20px}code{font:13px ui-monospace,Menlo,monospace;background:#f1f5f9;padding:1px 5px;border-radius:4px}
figure{margin:14px 0 0}figure img{display:block;max-width:100%;max-height:620px;width:auto;height:auto;border:1px solid var(--line);border-radius:10px}figcaption{font-size:13px;color:var(--muted);margin-top:6px}
.note footer{margin-top:12px;font-size:12.5px;color:var(--muted)}.muted{color:var(--muted)}
pre{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:12px 14px;overflow-x:auto;font:12.5px/1.5 ui-monospace,Menlo,monospace}
@media print{body{background:#fff}.note{border-color:#ccc}}
</style></head><body><div class="wrap">
<p class="eyebrow">${esc(data.project || config.project)} · Handover</p><h1>${esc(title)}</h1>
<p class="meta">${handover ? `Handed over ${esc(handover.date)}` : `Draft generated ${today()}`}${previous ? ` · Changes since ${esc(previous.name)} (${esc(previous.date)})` : " · First handover"}${toRef ? ` · Tag <code>${esc(toRef)}</code>` : ""}</p>
${handover?.summary ? `<p class="summary">${esc(handover.summary)}</p>` : ""}
<ul class="counts">${counts.map(([l, n]) => `<li>${n} ${esc(l.toLowerCase())}</li>`).join("") || "<li>No notes in this handover</li>"}</ul>
${notes.length ? `<nav class="toc" aria-label="Contents"><strong>Contents</strong><ol>${notes.sort((a, b) => a.ref - b.ref).map((n) => `<li><a href="#note-${n.ref}">#${n.ref} ${esc(n.title)}</a></li>`).join("")}</ol></nav>` : ""}
${sections || `<p class="muted" style="margin-top:32px">${previous ? "No notes were added in this handover." : "This is the baseline: everything in the prototype up to this point has been handed over."}</p>`}
${commits.length ? `<section><h2>Commits <span>${commits.length}</span></h2><pre>${esc(commits.join("\n"))}</pre></section>` : ""}
${files.length ? `<section><h2>Files changed</h2><pre>${esc(files.join("\n"))}</pre></section>` : ""}
</div></body></html>`;
  await mkdir(REPORTS, { recursive: true });
  const file = join(REPORTS, `${slug(title)}.html`);
  await writeFile(file, html);
  console.log(`Written: ${relative(process.cwd(), file)}`);
  return file;
}

// ---------- Run ----------
const command = process.argv[2];
if (command === "status") await status();
else if (command === "cut") await cut();
else if (command === "report") await report();
else {
  console.log(`Handover tool\n\n  status                  What's waiting for the next handover\n  cut "<name>"            Draw the line: hand over waiting notes, commit and tag\n                          --summary "…"  --no-commit  --include-all\n  report [next|<id>]      Write the handover document with screenshots`);
}
