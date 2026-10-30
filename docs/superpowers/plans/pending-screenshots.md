# Pending Screenshot Context — 0.2.0

## Approved design

Replace task-scoped retention with request-time pending-image projection. Preserve complete history and existing commands/settings. Only `phone_screenshot` tool-result image blocks are targeted. Do not modify Pi, RPC, Web or phone extension.

A screenshot is consumed when a later assistant response has stopReason `stop` or `toolUse`. Other reasons (including truncated `length`, error, aborted, pending, deferred and unknown) do not consume it. Keep all screenshots after the latest successful response; replace older phone image blocks with a marker, preserving text, metadata and source objects. A successful response is a transport/lifecycle indication, not proof of semantic understanding.

No input/queue/task boundary tracking; settings schema stays version 1. Ignore obsolete task entries rather than deleting history. Default disabled and idle-only toggles unchanged. Pending images can survive across new user input after unsuccessful analysis. Independent summary calls and later extension re-injection remain outside guaranteed coverage.

## Execution checklist and results

- [x] Inspect every caller of `projectScreenshotContext` (index and tests), SDK stop reasons and existing state persistence.
- [x] Rewrite tests first to require current pending batches only, preserving full source history.
- [x] Run against old code in Docker: 22 tests, 2 passed / 20 failed; real-loop failure showed accumulation `[0,1,2,2,3]` versus required `[0,1,1,0,1]`.
- [x] Remove TASK/before_agent_start tracking; keep branch-scoped settings and command validation.
- [x] Implement pure projection using latest complete successful assistant index; preserve metadata and other images.
- [x] Docker green: 22 passed, 0 failed, including real Pi 1.4.0 AgentSession with steer/follow-up, automatic 503 retry, file reopen and local install/remove.
- [x] Update README and package version to 0.2.0; explain changed semantics for already-enabled sessions and conservative interrupted response handling.
- [x] Final verification: 22/22 passed; npm pack --dry-run succeeds with 4 allowlisted files, version 0.2.0, ~5.3KB packed. Initial package dry-run hit an unwritable image HOME npm cache; reran successfully with task-owned /tmp cache (no host changes). git diff --check clean. Task-owned network-disabled Docker container stopped and removed.

## Review / boundaries

Author self-review only; no subagent delegation requested. Source diff checked for loss of textual content, mutation, reused IDs, settings upgrade, branch restoration, retry semantics and package contents. No destructive historical migration. No new dependencies. No production installation, paid provider calls, Git commit or remote push requested for this change. Production Web rendering, provider-specific payload shapes/performance and standalone summarization requests not tested. Static type checker/linter not run.
