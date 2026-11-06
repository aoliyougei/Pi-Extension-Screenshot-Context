# Universal Pending Input Images — 0.3.0

## Approved scope

Unify phone screenshot filtering with all tool images, user attachments and standard extension context input images. Keep existing on/off/status and persisted settings; no scope selector. Preserve pending batch, retry inputs, all text/metadata and original history. Do not mutate live Yolov8n session, Pi/RPC, Web or originating tools.

## Implementation and evidence

- context.ts: remove tool-name dependency. Target standard image blocks in array content of user/toolResult/custom messages before latest complete successful assistant response. Preserve assistant-generated images and system messages. Do not regex-redact text/JSON Base64.
- index.ts: generic description, status and warning; existing version-1 enabled settings migrate without writes.
- package version 0.3.0 and README explicitly warn that existing enabled sessions now filter all input images.
- Test-first Docker run: 37 tests, 23 passed / 14 failed with old implementation; non-phone real-loop accumulation and user/custom projection tests failed as expected.
- After implementation: 37 tests passed. Includes phone and non-phone read AgentSession calls, automatic 503 retry, actual user attachment normalization path, subsequent text prompt, on/off restoration, direct/nested image data, arbitrary tool names, custom messages, frozen source, metadata and text preservation, incomplete responses, active branches/compaction and installation/removal.
- User attachment test initially dropped fixture at host image resize before reaching extension. Verified processImage failure explicitly. Test disables image auto-resize (unrelated host/native resizing) and uses PNG fixture to isolate input context behavior; no claim of default image resizing validation.
- Final Docker npm test: 37 pass / 0 fail. npm pack --dry-run: exactly README.md/context.ts/index.ts/package.json; version 0.3.0, ~5.6KB packed. Network disabled, no dependencies installed or paid API calls.

## Self-review and remaining limits

Author self-review, no independent/subagent review requested. Check callers, roles, success cutoff, source immutability, migration semantics and package allowlist. Keep marker nonempty for image-only messages. Filtering operates on request copies, not persisted content or live runtime state. Nonstandard Base64 embedded in text, independent summary model calls and later handlers reintroducing images are not covered. Production Web deployment/latency and static type checker not validated. No auto Git commit, push, tag or live installation performed.
