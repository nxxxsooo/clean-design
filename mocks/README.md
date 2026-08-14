# Local CLI mocks

`mocks/` provides deterministic, offline stand-ins for Clean Design's five
public local coding runtimes:

- `claude` — Claude Code stream JSON
- `codex` — Codex JSON events
- `agy` — Antigravity plain stdout
- `opencode` — OpenCode JSON events
- `pi` — Pi RPC over JSON lines

The internal `byok-opencode` runtime resolves `opencode-cli`, which delegates
to the same OpenCode mock. It is intentionally not presented as a sixth public
runtime.

All output is generated from a small synthetic scenario in
`mock-agent.mjs`. The mock set contains no captured user prompts, production
traces, absolute user paths, credentials, remote manifests, uploads, or network
fetches. Prompt input is consumed but never copied into the synthetic output.

## Use

```bash
export PATH="$PWD/mocks/bin:$PATH"
export CLEAN_DESIGN_MOCK_NO_DELAY=1

printf 'Create a small status card.' | claude -p
printf 'Create a small status card.' | codex exec
printf 'Create a small status card.' | agy -p -
printf 'Create a small status card.' | opencode run
printf '{"id":1,"type":"prompt","message":"Create a small status card."}\n' | pi --mode rpc
```

Set `CLEAN_DESIGN_MOCK_RESPONSE` to replace the final assistant text. Set
`REPORT_FILE` when a harness expects the final response to be copied to a
local report file.

## Checks

```bash
bash mocks/scripts/smoke-test.sh
node --check mocks/mock-agent.mjs
node --check mocks/lib/format-pi.mjs
```

The smoke test exercises CLI probes and one generation path for every public
runtime plus the internal `opencode-cli` alias. It performs no network access
and requires no provider or CLI authentication.
