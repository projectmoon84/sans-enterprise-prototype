# Handover layer

A switchable layer over a working prototype for writing handover notes, plus a small tool that draws a line under each handover and writes the handover document, with screenshots.

It has no dependencies. Playwright is optional and is only used for screenshots.

## How it works

- **Notes** attach to components, pages, or the whole prototype. Each has a **type** for the handover document (New feature, Change, Global change, Fix) and a **category** for who it's for (Development, Interaction, Accessibility and Content by default; edit the list from a note's category menu).
- **They look like Figma annotations:** small dark chips, dashed blue outlines and leader lines, in their own typeface. That keeps them clearly separate from the product UI.
- **Components** are named with `data-spec` attributes, so notes follow them when the layout changes.
- **Handovers** are lines in the sand. Cutting one assigns every waiting note to it, commits, and tags git (`handover-1`, `handover-2` and so on).
- **The handover document** lists the notes, grouped by type, each with a screenshot of its component marked up. It also lists the commits and files changed since the previous handover.
- **Editing** works when you run the prototype locally. Hosted copies, such as Vercel, show the notes read-only.

## Using it day to day

1. Run the prototype locally (`python3 serve.py`) and press **Alt+H**, or click **Notes** in the prototype bar at the top.
2. Choose **+ Annotate** (or press **Alt+N**), then click a component. The first time, it asks for your name.
3. Write the note. Notes save straight to `handover/data.json`, so commit them with your design work.
4. Check what's waiting:

   ```sh
   npm run handover:status
   ```

5. Preview the document at any time. It's written to `handover/reports/`:

   ```sh
   npm run handover:report
   ```

6. When you're ready to hand over, commit your work, then:

   ```sh
   npm run handover:cut -- "Handover 2 · Teams" --summary "Teams list and team page"
   ```

   This assigns the waiting notes, rebuilds, commits, tags `handover-2` and writes the document.

To regenerate the document for an earlier handover, run `node handover/cli.mjs report handover-1`. Screenshots are taken from the build saved at that tag.

Other things you can do:

- In the notes panel, **Copy as ticket** copies a note's title, type, location, description and a link, ready to paste into Jira.
- A link ending in `#hl=7` opens the prototype on note 7.
- **Hold back** on a note keeps it out of the next handover, for work that isn't ready. Held notes are listed under **On hold** in the panel and by `handover:status`. Choose **Include in next handover** to release them.

To include screenshots, install Playwright once:

```sh
npm install --save-dev playwright && npx playwright install chromium
```

## Adding it to another prototype

1. **Copy the files.** Copy this `handover/` folder into the new project, keeping `layer/handover-layer.js`, `cli.mjs`, `config.json` and an empty `data.json` containing `{"version":1,"notes":[],"handovers":[]}`.
2. **Load the layer.** Load `handover/layer/handover-layer.js` in the prototype, through a `<script>` tag or your build, and embed the notes so hosted copies can show them:

   ```html
   <script>window.__HANDOVER_DATA__ = window.__HANDOVER_DATA__ || /* contents of handover/data.json */;</script>
   <script src="handover/layer/handover-layer.js"></script>
   ```

3. **Start it with an adapter.** The adapter tells the layer how to name a screen and how to get back to one:

   ```js
   HandoverLayer.init({
     project: "My prototype",
     data: window.__HANDOVER_DATA__,
     toolbar: "#handover-tools",                       // optional: a slot in your own top bar for the controls
                                                       // (mark the bar with data-handover-bar so panels sit below it)
     endpoint: location.protocol.startsWith("http") ? "/__handover/data" : null,
     getView: () => location.hash || "home",         // a short key for the current screen
     viewLabel: (view) => view,                        // a readable name for it
     goTo: (view) => { location.hash = view; },        // navigate there
     reveal: (anchor) => {},                           // optional: open whatever shows anchor.spec
   });
   ```

4. **Name the components** you'll annotate: `data-spec="area.component" data-spec-label="Readable name"`. Without one, a note attaches to a CSS selector or the page. Modal dialogs work too: while one is open, the layer moves inside it so it stays usable.
5. **Save locally.** Add the save endpoint to your local server: `GET` and `POST /__handover/data`, reading and writing `handover/data.json`. `serve.py` in this project shows how, in about 20 lines.
6. **Set up the config.** Set `project`, `build`, `entry` and `viewLabels` in `handover/config.json`.

## Data format

`handover/data.json`:

```json
{
  "version": 1,
  "project": "SANS Enterprise Portal",
  "nextRef": 11,
  "categories": [{ "key": "content", "label": "Content", "colour": "#e07b10" }],
  "handovers": [{ "id": "h1", "name": "Handover 1", "date": "2026-10-30", "tag": "handover-1", "summary": "", "notes": 10 }],
  "notes": [{
    "id": "n-…", "ref": 1, "type": "annotation", "kind": "feature",
    "title": "…", "body": "Markdown-lite text",
    "category": "interaction",
    "anchor": { "view": "teams", "spec": "teams.card", "label": "Team card" },
    "handover": null, "author": "Matt", "createdAt": "2026-10-29", "updatedAt": "2026-10-29"
  }]
}
```

`handover: null` means the note is waiting for the next handover. `anchor: null` means it applies everywhere. `type` is always `annotation` for now. Feedback comments will use the same shape with `type: "feedback"`, plus a thread and mentions.

## Next steps

- **Feedback:** comments from stakeholders and developers, with categories, replies, mentions and attachments, stored in a shared database so everyone sees them.
- **Simple profiles** for tagging people, without full accounts.
- **Before and after screenshots** for Change notes, comparing against the previous handover's build.
