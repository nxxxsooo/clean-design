# Local Data Sources

The live dashboard accepts only sources the user explicitly placed in scope.

## Source types

- `local_file`: a project-relative JSON snapshot, normally `data.json`.
- `daemon_tool`: an authenticated, read-only local daemon tool explicitly supplied by the host.
- `sample`: seeded preview data that is always labeled `Sample data`.

An example project-relative descriptor:

```json
{
  "type": "local_file",
  "path": "data.json",
  "refreshSeconds": 30,
  "staleAfterSeconds": 90,
  "transform": "dashboard_snapshot_v1"
}
```

## Snapshot shape

`data.json` is a bounded JSON object with display-ready values:

```json
{
  "generatedAt": "2026-08-09T00:00:00.000Z",
  "kpis": [{ "id": "open", "label": "Open work", "value": "24", "delta": "2 fewer this week" }],
  "trend": [18, 21, 20, 24, 23, 25, 24],
  "activity": [{ "id": "a1", "label": "Plan reviewed", "when": "12 min ago" }],
  "rows": [{ "id": "r1", "title": "Launch review", "status": "In review", "owner": "AM", "due": "Aug 12" }]
}
```

Keep snapshots small and presentation-oriented. Do not store raw responses, logs, HTML, credentials, cookies, headers, tokens, transcripts, or application configuration.

## Browser refresh

For `local_file`, refresh with `fetch('./data.json', { cache: 'no-store' })`. Validate the response shape before replacing the current snapshot. If validation or loading fails, retain the previous snapshot and show a stale state.

For `daemon_tool`, use only the authenticated endpoint and tool reference provided by the Clean Design host. The artifact must not discover tools, construct provider URLs, or request credentials.
