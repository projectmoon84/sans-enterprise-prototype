# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Security training managers at organizations that buy SANS training. They sign in to the SANS Enterprise Portal as portal users with one of three roles (Admin, Limited Admin, Viewer) and manage their organization's students: inviting people, assigning vouchers, admin groups and teams, approving training requests and tracking courses and GIAC certifications. Portal users also view reporting dashboards.

They work at a desk on a laptop or desktop, often on many records at once (CSV imports, bulk changes).

## Product Purpose

The Enterprise Portal is where an organization administers its SANS training: who has portal access, who is a student, which vouchers fund them, and how they are grouped. Success is an admin getting people onboarded, funded and organized quickly and correctly, and being able to see how their training programme is going.

This repository is a browser-only prototype of the portal. It is used for three things:

- client demos and sign-off with SANS stakeholders;
- usability testing with real admins;
- a developer handoff specification for the production build.

Longer term, the portal will add reporting tools and training pathways that promote SANS training.

## Operating Context

- Reporting dashboards are embedded from GoodData, not built in the portal.
- The design source of truth is the "[WIP] Enterprise Dashboard" Figma file; the prototype follows it.
- The prototype runs entirely in the browser with mock data in localStorage; invitations, email, authentication and SANS account lookup are simulated.

## Capabilities and Constraints

- Vouchers sit above admin groups: choose vouchers first, then admin groups covered by them.
- A Limited Admin has exactly one voucher and one or more admin groups within it.
- A student has exactly one voucher (or is saved as Needs voucher and not invited until one is assigned), at most one admin group and at most one team.
- Portal users receive access to teams; students are members of teams.
- One person can be both a portal user and a student, matched by email.
- SSO Admin is future scope.
- Detailed rules live in CLAUDE.md and docs/.

## Brand Commitments

- SANS brand guidelines apply.
- The Figma file is binding for layout, components and styling.
- UI copy is US English in title case (the client's house style).

## Evidence on Hand

- Fictional seed data only (9 portal users, 14 students); no real customer data, testimonials or metrics. Do not invent them.
- Figma reference exports and a design-coverage report in `audit/`.

## Product Principles

1. Bulk first: admins handle many people at once, so every flow should scale from one record to hundreds.
2. Never lose work or surprise people: preview side effects, offer Undo, and explain skipped rows.
3. Funding drives structure: vouchers decide what else can be assigned.
4. Show what needs attention without making the admin hunt for it.
5. Prototype as specification: behavior should be precise enough for engineers to build from.

## Accessibility & Inclusion

WCAG 2.2 AA on every screen. Desktop-first; mobile layouts should work but are secondary. Respect reduced-motion preferences.
