#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
MOCKS="$(cd "$HERE/.." && pwd -P)"
export PATH="$MOCKS/bin:$PATH"
export CLEAN_DESIGN_MOCK_NO_DELAY=1

failed=0
pass() { printf '  \033[32mOK\033[0m %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m %s\n' "$1"; failed=$((failed + 1)); }

assert_first_type() {
  local label="$1" expected="$2" command="$3"
  local first actual
  first=$(sh -c "$command" | head -n 1 || true)
  actual=$(printf '%s' "$first" | node -e '
    let value = "";
    process.stdin.on("data", (chunk) => { value += chunk; });
    process.stdin.on("end", () => {
      try { process.stdout.write(String(JSON.parse(value).type ?? "")); }
      catch { process.stdout.write("INVALID"); }
    });
  ')
  if [ "$actual" = "$expected" ]; then
    pass "$label first event is $expected"
  else
    fail "$label first event was $actual; expected $expected"
  fi
}

echo "Checking Clean Design local CLI mocks"

for agent in claude codex agy opencode opencode-cli pi; do
  version=$("$agent" --version 2>/dev/null || true)
  if printf '%s' "$version" | grep -q '^clean-design-.*-mock 1\.0\.0$'; then
    pass "$agent version probe"
  else
    fail "$agent version probe returned: $version"
  fi
done

assert_first_type claude system "printf 'smoke' | claude -p"
assert_first_type codex thread.started "printf 'smoke' | codex exec"
assert_first_type opencode step_start "printf 'smoke' | opencode run"
assert_first_type opencode-cli step_start "printf 'smoke' | opencode-cli run"

agy_output=$(printf 'smoke' | agy -p -)
if printf '%s' "$agy_output" | grep -q 'Mock antigravity response'; then
  pass "agy emitted plain output"
else
  fail "agy emitted unexpected output: $agy_output"
fi

pi_output=$(printf '%s\n' '{"id":1,"type":"prompt","message":"smoke"}' | pi --mode rpc)
if printf '%s' "$pi_output" | grep -q '"type":"response","id":1,"success":true' \
  && printf '%s' "$pi_output" | grep -q '"type":"message_update"' \
  && printf '%s' "$pi_output" | grep -q '"type":"agent_end"'; then
  pass "pi RPC round trip"
else
  fail "pi RPC round trip was incomplete"
fi

if [ "$failed" -ne 0 ]; then
  echo "$failed mock check(s) failed."
  exit 1
fi

echo "All local CLI mocks passed."
