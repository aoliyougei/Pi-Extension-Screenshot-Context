# Image Receipts — 0.4.0-rc.1 (UNTESTED)

Operator explicitly requested code modification without automated execution; they will manually test. Test image pi-agent-rpc:0.4.1 creation failed (404). No local tests, fallback execution, installs or paid API calls performed.

## Changes
- Remove global last-success cutoff. Explicit per-instance receipt controls projection.
- Instance key: source entry ID + block index + SHA256 image content; current branch limits lookup. Unmapped/modified/ambiguous sources stay pending.
- context only stages candidates; before_provider_request observes common inline payload structures; complete successful turn_end associates and persists image IDs plus successful assistant entry ID.
- No receipt on unknown payload, incomplete response, multiple payload callbacks or invalid branch ancestry.
- Restore persisted receipts from active branch. No historical auto-consumption migration; upgraded old images may be resent once (potentially large first request).
- Wording no longer implies saved image observations. No explicit acknowledgment tool added.

## Known limits
Pure plugin cannot establish arbitrary-request correlation: SDK lacks unified request ID/final-hook event. One payload per staged context plus matching branch success is a constrained association, not universal proof. Later before_provider_request hooks may still remove images undetected. Hashing unknown/reencoded payloads fails conservatively. Custom messages without normal message entry remain pending. Not production-validated.

## Tests updated, NOT RUN
- Pure receipt projection, source integrity, same-bytes/new-instance, repeated projection and payload shapes.
- Real SDK handler receipt success/failure/reload/branch and ambiguous payload tests.
- Actual loopback HTTP capture with provider serializer and later context image removal; no external model.
- streamFunction-only fixture expected to retain images without payload evidence.

User manual test required before tagging/releasing; do not represent previous 37 tests as results for this revision. No commits, pushes, tags or production installations performed. Static file inspection and git diff --check only.
