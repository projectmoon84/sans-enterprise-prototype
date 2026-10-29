---
name: SANS Enterprise Portal
description: Admin workspace for managing an organisation's SANS training, people and vouchers.
colors:
  control-navy: "#001429"
  nav-active: "#00364e"
  signal-cyan: "#00b5d5"
  signal-cyan-deep: "#009fbd"
  cyan-tint: "#eaf8fb"
  focus-teal: "#007c9b"
  link-teal: "#20718a"
  ink: "#0f172b"
  slate-strong: "#31445f"
  slate: "#45556c"
  slate-soft: "#62748e"
  icon-quiet: "#90a1b9"
  control-border: "#c5d4e8"
  hairline: "#dce6f1"
  wash: "#f1f5f9"
  table-head: "#f8fafc"
  canvas: "#e2e8f0"
  surface: "#ffffff"
  success-text: "#00824a"
  success-tint: "#effcf4"
  success-border: "#a7f3c1"
  warning-text: "#8a4b00"
  warning-tint: "#fffaeb"
  warning-border: "#ffd37c"
  danger-text: "#a02c33"
  danger-tint: "#fdecec"
typography:
  display:
    fontFamily: "Fira Sans, Arial, sans-serif"
    fontSize: "36px"
    fontWeight: 500
    lineHeight: "44px"
  intro:
    fontFamily: "Fira Sans, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "24px"
  body:
    fontFamily: "Fira Sans, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
  body-strong:
    fontFamily: "Fira Sans, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: "20px"
  label:
    fontFamily: "Fira Sans, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "18px"
rounded:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  pill: "24px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.signal-cyan}"
    textColor: "#000000"
    rounded: "{rounded.pill}"
    padding: "7px 14px"
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.slate-strong}"
    rounded: "{rounded.pill}"
    padding: "9px 16px"
    height: "40px"
  input-search:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "7px 12px 7px 39px"
    height: "40px"
  filter-chip:
    backgroundColor: "{colors.cyan-tint}"
    textColor: "#0b3b4b"
    rounded: "20px"
    padding: "5px 12px"
  badge-active:
    backgroundColor: "{colors.success-tint}"
    textColor: "{colors.success-text}"
    rounded: "20px"
    padding: "3px 6px"
  badge-pending:
    backgroundColor: "{colors.warning-tint}"
    textColor: "{colors.warning-text}"
    rounded: "20px"
    padding: "3px 6px"
  table-header:
    backgroundColor: "{colors.table-head}"
    textColor: "#61758e"
    typography: "{typography.label}"
  table-cell:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    height: "72px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "24px"
  dialog:
    backgroundColor: "#f2f6fa"
    rounded: "{rounded.lg}"
  nav-item:
    backgroundColor: "{colors.control-navy}"
    textColor: "#dadddf"
    height: "46px"
  nav-item-active:
    backgroundColor: "{colors.nav-active}"
    textColor: "{colors.surface}"
    height: "46px"
---

# Design System: SANS Enterprise Portal

## Overview

**Creative North Star: "The Control Room"**

The portal is where a training manager sees the state of their whole programme at a glance and acts on it. A deep navy frame holds the navigation; the work happens on white surfaces laid on a cool slate canvas. Status is the point: active, pending, suspended, needs voucher and needs attention must read instantly against everything else, which stays quiet.

The mood is confident, clear and friendly. Data is dense (72px table rows, 14px body text), but rounded pill controls, soft tinted badges and generous card padding keep it approachable rather than austere. The Figma file is the source of truth; this document records what the prototype implements from it.

**Key Characteristics:**
- Navy frame, slate canvas, white work surfaces.
- One signal colour (cyan) for primary action, current location and selection.
- Status carried by tinted, bordered pills with dark text.
- Flat surfaces; shadows only on things that float.
- Fira Sans throughout, in two weights.

## Colors

A cool slate-and-navy base with a single bright cyan signal and soft semantic tints for status.

### Primary
- **Signal Cyan**: primary buttons, the sliding active bar in the sidebar, selected checkboxes and progress. Text on it is black, not white, for contrast.
- **Signal Cyan Deep**: borders of filter chips and other cyan outlines where Signal Cyan is too light against white.
- **Cyan Tint**: background of filter chips and selected or highlighted rows.

### Secondary
- **Focus Teal**: focus rings and keyboard focus outlines.
- **Link Teal**: inline links and secondary informational text such as "Awaiting SANS account".

### Neutral
- **Control Navy**: the sidebar and app frame.
- **Nav Active**: background of the current sidebar item.
- **Ink**: primary text, names and headings.
- **Slate Strong**: secondary button text and strong supporting copy.
- **Slate**: secondary text in cells (roles, scopes).
- **Slate Soft**: quiet meta text (table headers, small labels such as "Portal user").
- **Icon Quiet**: small decorative icons beside meta text.
- **Control Border**: outlines of buttons, inputs and selects.
- **Hairline**: dividers, table rules and menu borders.
- **Wash**: hover backgrounds for menu items and quiet pills.
- **Table Head**: table header row.
- **Canvas**: page background behind cards and tables.
- **Surface**: cards, tables, menus.

### Status
- **Success** (text, tint, border): Active status.
- **Warning** (text, tint, border): Pending invite, Needs voucher.
- **Danger** (text, tint): errors, Suspended, destructive confirmations.

### Named Rules
**The One Signal Rule.** Cyan means "act here" or "you are here". Never use it for decoration, and never for status.

**The Status Pill Rule.** Status always uses tint + border + dark text of one hue. Never a solid fill, never colour alone without the word.

## Typography

**Body Font:** Fira Sans (with Arial, sans-serif), bundled into the build.

**Character:** One humanist sans in regular (400) and medium (500). Hierarchy comes from size and weight, never from a second family.

### Hierarchy
- **Display** (500, 36px, 44px): page titles only.
- **Intro** (400, 16px, 24px): the line under a page title, and search input text.
- **Body** (400, 14px, 20px): table cells, form text, buttons.
- **Body strong** (500, 14px, 20px): person names in tables, card titles.
- **Label** (500, 12px, 18px): table headers, meta tags such as "Portal user" and "Student", chip counts.

### Named Rules
**The Two Weights Rule.** Only 400 and 500. Emphasis beyond medium comes from size or position, not bold.

## Layout

A fixed navy sidebar on the left; the main area sits on the slate canvas with 24px side padding. Pages stack a header (title, intro, primary actions), a filter toolbar with quick-filter chips, then a white table or cards. Tables use 72px rows and sticky headers, with frozen checkbox, name and menu columns on narrow widths. Spacing follows a 4px base (4, 8, 12, 16, 24, 32). Desktop-first: on phones, tables scroll horizontally and secondary meta wraps under the primary text rather than truncating.

## Elevation & Depth

Flat by default. Cards and tables sit on the canvas with no shadow; separation comes from the white-on-slate contrast and hairline rules. Shadows appear only on layers that float above the page.

### Shadow Vocabulary
- **Dialog** (`box-shadow: 0 16px 36px #00000026`): modals.
- **Menu** (`box-shadow: 0 4px 12px #10182824`): dropdown menus, select pickers, row action menus.
- **Pop-over** (`box-shadow: 0 8px 24px #10182833`): cell pop-overs in the CSV review.
- **Frozen edge** (`box-shadow: 8px 0 8px -8px #0f172b33`): edge of a frozen table column while scrolling.

### Named Rules
**The Float-Only Rule.** If it doesn't float above the page, it has no shadow.

## Shapes

Gently rounded throughout. Interactive controls (buttons, inputs, selects) are full pills (24px); chips and status badges are pills (20px). Cards, tables and dialogs use 16px corners; menus and small panels use 8px; checkboxes 6px. Borders are 1px, in Control Border on controls and Hairline on dividers.

## Components

### Buttons
- **Shape:** pill (24px).
- **Primary:** Signal Cyan fill, black text, 36px tall.
- **Secondary:** white with Control Border outline and Slate Strong text, 40px tall.
- **Hover / Focus:** every hover state fades over 400ms; focus shows a Focus Teal ring.

### Chips
- **Filter chips:** Cyan Tint background, Signal Cyan Deep border, dark teal text, with a white count bubble.
- **Status badges:** see The Status Pill Rule.
- **Meta tags** (e.g. "Portal user", "Student" beside a person's role): no fill at rest; Label type in Slate Soft with a 12–16px Icon Quiet glyph. On hover a faint Wash pill appears behind them. No underline.

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** Surface on Canvas.
- **Shadow Strategy:** none (The Float-Only Rule).
- **Internal Padding:** 24px.

### Inputs / Fields
- **Style:** white, Control Border outline, pill radius, 40px tall; search has a leading icon.
- **Selects and menus:** one style for every dropdown, matching the Actions menu: white panel, Hairline border, 8px radius, Menu shadow, 40px options with Wash hover.

### Tables
- Header row in Table Head with Label type in Slate Soft; 72px body rows; person cell shows the name in Body strong with role or email beneath in Slate, plus meta tags beside it.

### Navigation
- Control Navy sidebar, 46px items, light grey text; the active item gets Nav Active background, white text and a Signal Cyan bar on its left edge that slides to the new item when the selection changes.

### Dialogs
- Light blue-grey panel (#f2f6fa), 16px corners, Dialog shadow. They open with a short rise and backdrop fade, then the header, body sections and footer stagger in quickly. Reduced-motion users get no animation.

## Do's and Don'ts

### Do:
- **Do** keep cyan for action, location and selection only.
- **Do** use tinted, bordered pills with the status word for every status.
- **Do** fade hover states over 400ms.
- **Do** keep every dropdown and select on the shared menu style.
- **Do** match the Figma file; where it and this document disagree, Figma wins and this file should be updated.

### Don't:
- **Don't** add shadows to cards, tables or anything resting on the canvas.
- **Don't** introduce a second font family or weights other than 400 and 500.
- **Don't** underline meta tags on hover; use the Wash pill instead.
- **Don't** put white text on Signal Cyan.
