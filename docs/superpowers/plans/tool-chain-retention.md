# Tool-chain retention — 0.4.0

## Scope

Operator provided reproduction and manually validated installed-copy fix. Apply the same minimal correction to official source without modifying installed copy: generate new receipts only on assistant stop, not toolUse. Do not change readState's historical stop/toolUse receipt compatibility, instance identity, payload matching, branch isolation or failure behavior. This is not agent_settled semantics.

## Changes

- index.ts: stop-only turn_end guard; command policy clarifies retention throughout tools.
- test/tool-chain.test.mjs: observed image -> toolUse -> one image/no new receipt -> observed stop -> zero images -> same-content reread -> one image. Added legacy toolUse receipt compatibility regression.
- README: explicit stop-only behavior, historical receipts unchanged, forced continuation after stop caveat, larger long-chain payload tradeoff and honest validation scope.
- package.json: initially 0.4.0-rc.2; promoted to 0.4.0 at the operator's explicit request after their manual validation.

## Verification

User reports 26 non-install tests and task acceptance passed on installed copy before this request. This session did not rerun those tests and does not claim them as source-tree results. Docker image query for *pi-agent-rpc* returned empty. Existing user instruction requests code-only modifications with manual validation; no local execution fallback. Typecheck/install tests not run. Static diff review and git diff --check only. No dependency installs or production edits. After the operator confirmed manual validation, they authorized committing/pushing main and an annotated stable v0.4.0 tag. No additional automated test pass is claimed.

## Remaining risk

Existing receipts may still omit historical images; reread creates new instances. stop followed by forced continuation may still omit images, intentionally outside this minimal correction. Long tool chains retain larger image payloads. Payload observation remains weaker than final delivery proof or visual understanding.
