# Tmux Status Line Script

## Objective

Create a shell script at `scripts/ergon-status-tmux` that reads `ergon status --json` output and prints a single-line formatted string suitable for embedding in a tmux status bar.

## Success Criteria

- [ ] `scripts/ergon-status-tmux` exists and is executable (`chmod +x`)
- [ ] Running `scripts/ergon-status-tmux` when a timer is active prints exactly: `PCK-123 Fix the bug | 2h 30m` (issue key, space, summary truncated to 30 chars, pipe, today's formatted duration)
- [ ] When the summary exceeds 30 characters, it is truncated to 30 characters with `…` appended: `PCK-123 A very long summary te… | 2h 30m`
- [ ] When no timer is active, prints exactly: `-- | 2h 30m` (double dash, pipe, today's formatted duration)
- [ ] When `ergon status --json` fails (exit code non-zero), prints exactly: `--` and exits 0 (tmux must never see a failure)
- [ ] When `jq` is not installed, prints exactly: `--` and exits 0
- [ ] The script uses `#!/usr/bin/env bash` shebang
- [ ] The script calls `deno task ergon status --json` by resolving the project directory relative to the script's own location
- [ ] The script does not hardcode absolute paths to the ergon project
- [ ] `deno check src/main.ts` — zero type errors (no TypeScript changes, but verify nothing broke)
- [ ] `deno task test` — all 12 existing tests pass

## Out of Scope

- Do not modify any TypeScript source files (`src/**`)
- Do not modify `deno.json`, `flake.nix`, or any config files
- Do not add color/styling codes — tmux handles styling via its own config
- Do not add icons or emoji — keep output plain ASCII plus `…` for truncation
- Do not add a `--format` flag or any CLI options to the script
- Do not add caching or polling — tmux calls this script at its own refresh interval
- Do not add unit tests for the shell script

## Technical Context

- **Stack:** Bash shell script (not Deno/TypeScript)
- **Dependencies:** `bash`, `jq` (for JSON parsing), `deno` (to run ergon)
- **Target location:** `/Users/lukasz/Code/ergon/scripts/ergon-status-tmux`
- **Existing script in same directory:** `/Users/lukasz/Code/ergon/scripts/check-api.ts` (Deno script — different pattern, not relevant)

### `ergon status --json` output format

The `status` command is defined in `/Users/lukasz/Code/ergon/src/commands/status.ts` lines 6-13 and 51-53. When called with `--json`, it outputs:

**Timer active:**
```json
{
  "timer": {
    "issueKey": "PCK-123",
    "summary": "Fix the bug",
    "startedAt": "2025-01-15T09:30:00.000+0100"
  },
  "todaySeconds": 9000,
  "todayFormatted": "2h 30m"
}
```

**No timer:**
```json
{
  "todaySeconds": 3600,
  "todayFormatted": "1h"
}
```

Note: `timer` field is absent (not null) when no timer is running. `summary` inside `timer` is optional.

### Tmux integration

Users add this to their `~/.tmux.conf`:
```
set -g status-right '#(~/Code/ergon/scripts/ergon-status-tmux)'
```

Tmux calls the script at its `status-interval` (default 15s). The script must:
- Always exit 0 (non-zero causes tmux to show nothing)
- Print a single line to stdout with no trailing newline
- Complete quickly (avoid network calls if possible — but ergon status does call Clockwork API, so just let it run)

## Tasks

- [x] **Task 1: Create `scripts/ergon-status-tmux`**
  - Create the file at `/Users/lukasz/Code/ergon/scripts/ergon-status-tmux`
  - Shebang: `#!/usr/bin/env bash`
  - Resolve the ergon project directory: `SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"` then `PROJECT_DIR="$(dirname "$SCRIPT_DIR")"`
  - Guard: check `command -v jq` — if missing, `printf '%s' '--'` and `exit 0`
  - Run ergon: `json=$(cd "$PROJECT_DIR" && deno task ergon status --json 2>/dev/null)` — if exit code is non-zero, `printf '%s' '--'` and `exit 0`
  - Parse JSON with `jq`:
    - `today=$(echo "$json" | jq -r '.todayFormatted')`
    - `issue_key=$(echo "$json" | jq -r '.timer.issueKey // empty')`
    - `summary=$(echo "$json" | jq -r '.timer.summary // empty')`
  - If `issue_key` is empty: `printf '%s' "-- | $today"`
  - If `issue_key` is set:
    - Truncate summary: if `${#summary}` > 30, then `summary="${summary:0:30}…"`
    - `printf '%s' "$issue_key $summary | $today"`
  - If summary is empty but issue_key is set: `printf '%s' "$issue_key | $today"` (no extra space)
  - Exit 0

- [x] **Task 2: Make the script executable**
  - Run `chmod +x scripts/ergon-status-tmux`

- [ ] **Task 3: Verify**
  - Run `deno check src/main.ts` — zero type errors
  - Run `deno task test` — all 12 existing tests pass
  - Run `scripts/ergon-status-tmux` manually — verify output format matches expectations
  - Run `file scripts/ergon-status-tmux` — confirm it shows "Bourne-Again shell script" or similar

## Data Examples

**Input JSON (timer active, short summary):**
```json
{"timer":{"issueKey":"PCK-123","summary":"Fix the bug","startedAt":"2025-01-15T09:30:00.000+0100"},"todaySeconds":9000,"todayFormatted":"2h 30m"}
```
**Expected output:** `PCK-123 Fix the bug | 2h 30m`

**Input JSON (timer active, long summary):**
```json
{"timer":{"issueKey":"PCK-456","summary":"Implement the new authentication flow for OAuth2","startedAt":"2025-01-15T09:30:00.000+0100"},"todaySeconds":3600,"todayFormatted":"1h"}
```
**Expected output:** `PCK-456 Implement the new authentication… | 1h`

**Input JSON (timer active, no summary):**
```json
{"timer":{"issueKey":"PCK-789","startedAt":"2025-01-15T09:30:00.000+0100"},"todaySeconds":0,"todayFormatted":"0s"}
```
**Expected output:** `PCK-789 | 0s`

**Input JSON (no timer):**
```json
{"todaySeconds":7200,"todayFormatted":"2h"}
```
**Expected output:** `-- | 2h`

**Input (ergon fails):**
Command exits non-zero.
**Expected output:** `--`

## Assumptions

- `jq` is available on the target system (NixOS — can be added to `flake.nix` later if needed, but the script gracefully degrades without it)
- `deno` is on PATH when tmux invokes the script
- The script is always located inside the ergon project at `scripts/ergon-status-tmux` (one level below project root)
- Tmux handles its own refresh interval; the script does not need to cache results
- The `ergon status --json` command takes 1-3 seconds (network call to Clockwork API) — acceptable for tmux status refresh

## Verification Commands

```bash
chmod +x scripts/ergon-status-tmux
scripts/ergon-status-tmux
echo "exit code: $?"
deno check src/main.ts
deno task test
```
