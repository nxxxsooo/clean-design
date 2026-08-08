---
name: live-dashboard
description: |
  Quiet team dashboard rendered as a local Live Artifact. A single-page,
  self-contained HTML dashboard with KPIs, a seven-day sparkline, an activity
  feed, and a task table backed by a local snapshot or authenticated daemon tool.
triggers:
  - "team dashboard"
  - "live dashboard"
  - "ops dashboard"
  - "team workspace dashboard"
  - "团队仪表盘"
  - "实时仪表盘"
od:
  mode: prototype
  platform: desktop
  scenario: operation
  fidelity: high
  preview:
    type: html
    entry: index.html
    reload: debounce-100
  design_system:
    requires: true
    sections: [color, typography, layout, components, anti-patterns]
  craft:
    requires: [typography, color, anti-ai-slop, motion-discipline, state-coverage]
  inputs:
    - name: workspace_name
      type: string
      required: true
    - name: page_title
      type: string
      default: "Team Dashboard"
    - name: data_source
      type: enum
      values: [local_file, daemon_tool, sample]
      default: sample
    - name: source_label
      type: string
      default: "Local snapshot"
    - name: refresh_seconds
      type: integer
      default: 30
      min: 10
      max: 300
    - name: stale_after_seconds
      type: integer
      default: 90
      min: 30
      max: 600
    - name: kpi_count
      type: enum
      values: [2, 4, 6]
      default: 4
    - name: include_activity_feed
      type: boolean
      default: true
    - name: include_task_table
      type: boolean
      default: true
  parameters:
    - name: accent_hue
      type: hue
      default: 198
      range: [0, 360]
    - name: surface_warmth
      type: spacing
      default: 0
      range: [-12, 24]
    - name: density
      type: spacing
      default: 18
      range: [8, 36]
    - name: display_scale
      type: font-scale
      default: 1.0
      range: [0.85, 1.4]
  outputs:
    primary: index.html
    secondary: [data.json, provenance.json]
  capabilities_required:
    - file_write
    - surgical_edit
  example_prompt: "Build a quiet team dashboard for Acme Studio from a local JSON snapshot. Include total tasks, work completed this week, active members, and documents in review, with manual refresh and honest sample states."
---

# Live Dashboard

Build a local-first Live Artifact: an HTML page that behaves like a working dashboard without depending on an account, hosted service, or external data service.

## Pre-flight

1. Read `assets/template.html` and retain its interaction hooks.
2. Read `references/layouts.md` and choose one documented layout.
3. Read `references/components.md` and reuse its KPI, sparkline, activity, and table patterns.
4. Read `references/data-sources.md` and choose `local_file`, `daemon_tool`, or an explicitly labeled sample snapshot.
5. Read `references/checklist.md`; every P0 item must pass before completion.

## Build order

1. Bind the active `DESIGN.md` palette, type, spacing, and component rules.
2. Build a compact top bar with breadcrumb, refresh state, and manual refresh.
3. Add a clear page header and one-line source/provenance callout.
4. Render the requested KPI count with tabular numerals and honest labels.
5. Add the sparkline and optional activity feed.
6. Add the task table with complete loading, empty, error, stale, and sample states.
7. Attribute the local source in the footer without exposing absolute paths or secrets.

## Refresh behavior

- `init()` performs one silent refresh after mount.
- Manual Refresh reloads `./data.json` for `local_file`, or calls only an authenticated read-only daemon tool explicitly supplied by the host.
- Auto refresh is opt-in and uses `refresh_seconds`.
- A failed refresh preserves the previous valid snapshot and moves the status to stale.
- Never call arbitrary provider APIs, infer account access, or embed credentials.
- Sample data must always be visibly labeled `Sample data`.

## Hard rules

- No remote scripts, fonts, analytics, deployment SDKs, or hidden network calls.
- No invented metrics presented as real data.
- No raw HTML interpolation from source data; escape all strings.
- No credential, token, cookie, authorization header, transcript, or application-data content in output files.
- Honor `prefers-reduced-motion` and keyboard navigation.

## Output contract

- `index.html`: self-contained presentation and interactions.
- `data.json`: bounded local snapshot matching `references/data-sources.md`.
- `provenance.json`: source type, relative path or daemon-tool reference, refresh time, and transformation notes. Never include an absolute path or secret.
