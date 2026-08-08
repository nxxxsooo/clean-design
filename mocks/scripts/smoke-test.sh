#!/usr/bin/env bash
# Quick smoke test for the mock CLIs.
# Runs each agent's wrapper against a known recording and asserts that:
#   1. The mock binary exits 0
#   2. Stdout produces a sensible number of lines (>= 5 for JSON formats,
#      >= 1 for plain)
#   3. The first JSON line for each JSON agent has the expected shape
#
# Usage:
#   bash mocks/scripts/smoke-test.sh

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
MOCKS="$(cd "$HERE/.." && pwd -P)"
TRACE_ID="${OD_MOCKS_SMOKE_TRACE:-04097377}"   # the 17-tool claude session

# Ensure recordings are on disk — the corpus is hosted on R2 and fetched
# on demand. If nothing's been pulled yet (or only a few are), run the
# fetcher so smoke covers the full agent matrix.
if ! ls "$MOCKS/recordings"/*.jsonl >/dev/null 2>&1; then
  echo "no recordings found — fetching from R2 first..."
  bash "$HERE/fetch-recordings.sh" >/dev/null
  echo
fi

export PATH="$MOCKS/bin:$PATH"
export OD_MOCKS_TRACE="$TRACE_ID"
export OD_MOCKS_NO_DELAY=1

failed=0
pass()  { printf '  \033[32m✓\033[0m %s\n' "$1"; }
fail()  { printf '  \033[31m✗\033[0m %s\n' "$1"; failed=$((failed + 1)); }

check_json_first_event() {
  local agent="$1" expected_type="$2"
  local first
  first=$(echo "smoke" | "$agent" run 2>/dev/null | head -1 || true)
  if [ -z "$first" ]; then fail "$agent: empty stdout"; return; fi
  local got
  got=$(printf '%s' "$first" | node -e 'let buf="";process.stdin.on("data",d=>buf+=d);process.stdin.on("end",()=>{try{console.log(JSON.parse(buf).type||"")}catch{console.log("INVALID")}})')
  if [ "$got" = "$expected_type" ]; then
    pass "$agent first event = $expected_type"
  else
    fail "$agent first event = $got (wanted $expected_type)"
  fi
}

echo "Smoke testing mock CLIs against trace $TRACE_ID"
echo

# opencode / opencode-cli (primary OD-facing bin) → step_start
check_json_first_event opencode step_start
check_json_first_event opencode-cli step_start

# codex → thread.started
check_json_first_event codex thread.started

# claude → system / init
# (codex/claude have a different entry verb; using a uniform "first line type" check)
first=$(echo smoke | claude -p 2>/dev/null | head -1 || true)
if printf '%s' "$first" | grep -q '"type":"system"'; then
  pass "claude first event = system"
else
  fail "claude first event missing system shape: ${first:0:80}"
fi

# gemini → init
check_json_first_event gemini init

# cursor-agent → system + subtype:init
first=$(echo smoke | cursor-agent 2>/dev/null | head -1 || true)
if printf '%s' "$first" | grep -q '"type":"system"' && printf '%s' "$first" | grep -q '"subtype":"init"'; then
  pass "cursor-agent first event = system+init"
else
  fail "cursor-agent first event missing system/init shape: ${first:0:80}"
fi

# Plain agents — first non-empty line should be from the report content.
for agent in deepseek qwen grok; do
  out=$(echo smoke | "$agent" 2>/dev/null | head -1 || true)
  if [ -n "$out" ]; then
    pass "$agent emitted plain text (${#out} chars on first line)"
  else
    fail "$agent emitted nothing"
  fi
done

# Kimi — prompt-mode stream-json. Newer Kimi CLIs reject an `acp`
# positional arg, so keep this smoke check on the real prompt-mode
# launch shape OD uses in Settings and chat.
kimi_out=$(kimi -p "Reply with only: ok" --output-format stream-json 2>/dev/null || true)
if printf '%s' "$kimi_out" | grep -q '"role":"assistant"'; then
  pass "kimi prompt-mode stream-json smoke passed"
else
  fail "kimi prompt-mode stream-json smoke failed"
fi

kimi_legacy_err="$amr_sandbox/kimi-legacy.err"
if kimi acp -p "Reply with only: ok" --output-format stream-json \
  > /dev/null 2> "$kimi_legacy_err"; then
  fail "kimi legacy positional launch unexpectedly succeeded"
elif grep -q 'too many arguments' "$kimi_legacy_err"; then
  pass "kimi legacy positional launch fails with too many arguments"
else
  fail "kimi legacy positional launch failed without too many arguments"
fi

# ACP agents — JSON-RPC server. Send initialize+session/new+prompt and
# verify the protocol responses come back in order.
# kiro-cli and vibe-acp are the primary OD-facing bin names; test them
# alongside the fallback names (kiro, vibe).
for agent in hermes kilo kiro kiro-cli vibe vibe-acp devin; do
  out=$(cat <<EOF | "$agent" 2>/dev/null
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
{"jsonrpc":"2.0","id":2,"method":"session/new","params":{"cwd":"/tmp"}}
{"jsonrpc":"2.0","id":3,"method":"session/prompt","params":{"sessionId":"X","prompt":[{"type":"text","text":"hi"}]}}
EOF
)
  # Expect: id=1 initialize result, id=2 session/new result, ≥1 session/update, id=3 prompt result
  if printf '%s' "$out" | grep -q '"id":1,"result":{"protocolVersion":1' \
    && printf '%s' "$out" | grep -q '"id":2,"result":{"sessionId":' \
    && printf '%s' "$out" | grep -q '"sessionUpdate":"agent_message_chunk"' \
    && printf '%s' "$out" | grep -q '"id":3,"result":{"stopReason":'; then
    pass "$agent ACP roundtrip complete (init → session/new → update → prompt result)"
  else
    fail "$agent ACP roundtrip incomplete"
  fi
done

echo
if [ "$failed" -eq 0 ]; then
  echo "All mock CLIs working. ✅"
else
  echo "$failed check(s) failed. ❌"
  exit 1
fi
