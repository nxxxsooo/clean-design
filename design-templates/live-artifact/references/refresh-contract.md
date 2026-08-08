# Refresh Contract Reference

Refresh updates live artifact data without redesigning the presentation. The refresh runner updates `data.json`, provenance, and audit history; it does not allow arbitrary template rewrites.

## Refreshable source metadata

Refreshable documents use `sourceJson`:

```json
{
  "type": "local_file",
  "path": "data/source.json",
  "outputMapping": {
    "dataPaths": [{ "from": "items", "to": "releases" }],
    "transform": "compact_table"
  }
}
```

Supported source types:

- `local_file`
- `daemon_tool`

Supported output transforms:

- `identity`
- `compact_table`
- `metric_summary`

## Source execution model

- If a safe source descriptor exists, manual refresh executes it through daemon-owned local wrappers.
- Local file paths must remain inside the project or an explicitly linked local root.
- Daemon tools must be from the authenticated local allowlist and read-only for refresh.
- Do not call arbitrary provider APIs from refresh logic or skill-authored scripts.

## Commit behavior

Refresh is all-or-nothing:

1. Acquire one active refresh lock per artifact.
2. Execute each refreshable source with timeouts and current safety checks.
3. Build candidate `data.json`, provenance, and preview.
4. Validate all candidates with the same schemas used for create/update.
5. Commit only if every refreshable source succeeds.
6. Preserve the previous valid preview if any step fails.

Refresh IDs must be monotonic so stale runs cannot overwrite newer committed data.

## Audit storage

- Append compact records to `refreshes.jsonl`.
- Successful refresh snapshots live under `snapshots/<refreshId>/` and may include `data.json` and provenance.
- Failed refreshes are summarized in `refreshes.jsonl` without leaking source data or credentials.
- On daemon startup, stale running refreshes should be marked failed or timed out while preserving the last valid preview.
