# Screenshot Context Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an installable Pi extension that optionally omits historical phone screenshot images from model requests while preserving all screenshots from the current user task and complete persisted/Web history.

**Architecture:** Register a request-time `context` handler and `/screenshot-context on|off|status`. Preserve source messages; project only `phone_screenshot` tool-result image blocks. Establish user-task boundaries using the actual supported SDK lifecycle/session APIs, not each low-level agent run or each assistant response.

**Tech Stack:** TypeScript Pi extension; Node built-in tests; Docker-only execution; no new runtime dependencies.

**Spec:** Approved conversation requirements, captured below.

## Global Constraints / Small-change Design

- Work only in `/app/Pi-Extension-Screenshot-Context`; read other projects as references, do not modify them.
- Do not modify Pi/RPC core, existing phone extension, or Web.
- Default disabled. Commands: `/screenshot-context on`, `/screenshot-context off`, `/screenshot-context status`.
- Persist enabled state per session using non-model custom entries; reconstruct from the active branch on resume/navigation.
- Only allow setting changes while idle; invalid arguments must not change state. Status must not call a model.
- Enabled: retain all screenshots produced within the current user task across model/tool turns and retries; omit images from prior tasks, preserving text and tool metadata.
- Disabled: return the unmodified request context. Switching off may cause historical images to be transmitted again.
- Only target `toolResult` messages from `phone_screenshot`; preserve other tools and user images.
- Replace omitted image blocks with a short explanatory text marker, without creating empty tool results.
- Never change original messages, JSONL image contents, or history endpoints.
- Install the extension into the Pi process doing inference (RPC server for Web usage); loading/reloading existing sessions remains an operator action.
- Test/build/dependency operations run only in a task-owned Docker container. No host mounts, registry pushes, or paid model calls.

## Approved Compatibility Revision

The operator chose to keep existing Pi unchanged after the queue-delivery API limitation was explained. This version treats a normal idle user prompt as the task boundary. All steer and queued follow-up messages consumed by that prompt's busy period share the task. A later idle normal prompt starts the next task. This exception supersedes the original exact queued-follow-up requirement below; surface it in README, command description and status. Custom-trigger continuations do not create a new ordinary user task.

**Execution status:** Tasks 1–3 implemented; see `progress.md` for actual checks and deviations. Original checklists below are retained as planning history, not test evidence.

## Review Focus

- Retries, recovery and compaction must not be mistaken for a new user task.
- Steer and queued follow-up stay within the active task in the approved compatibility mode; neither resets the boundary at enqueue or delivery.
- Resume/navigation/reload must not retain a boundary from a different branch or silently reclassify all old screenshots as current.
- Older SDKs or unavailable boundary information must produce a clear documented compatibility limit rather than silently remove current screenshots.
- Composed extension handlers and Web command transport need explicit verification boundaries; unit mocks alone do not establish deployed compatibility.

## Task 1: Verify SDK contract and build request projection

**Files:** Create `package.json`, `index.ts`, `context.ts`, `test/context.test.mjs`; test runner format may change to match verified Node TypeScript support without adding a runtime dependency.

**Interfaces:** `projectScreenshotContext(messages, boundary)` produces request messages without mutating inputs. Exact boundary representation follows inspection of the installed/target SDK's session entry IDs and event payloads.

- [ ] Read complete relevant Pi extension, package and lifecycle docs and minimal examples; inspect target RPC SDK source. Pin the minimum supported SDK version only after verifying its actual interfaces.
- [ ] Confirm a durable, branch-aware user-task boundary strategy. If SDK events cannot distinguish queued work reliably, stop and report the limitation rather than guess from `agent_start` or timestamps.
- [ ] Write failing tests for historical/current screenshots, multiple current images, text-only prompts, other tool/user images, marker output, call metadata and frozen original messages.
- [ ] Run tests in Docker and inspect expected failures before implementing projection.
- [ ] Implement the minimal pure projection and run tests to green in Docker.

## Task 2: Add lifecycle, commands and state persistence

**Files:** Modify `index.ts`; create `test/extension.test.mjs` (or equivalent supported TypeScript tests).

**Interfaces:** Default extension factory registers `context`, `/screenshot-context`, and the minimum lifecycle hooks required by Task 1. Package exposes only the extension entry point using Pi package metadata.

- [ ] Write failing registration/behavior tests: disabled passthrough; on/off/status; invalid input; idle-only updates; per-session persistence; active-branch restore; current-task projection.
- [ ] Add lifecycle tests for multi-turn execution, retries, aborted requests, compaction, steer, queued follow-up, resume and branch switch using actual SDK semantics wherever possible.
- [ ] Run tests to observe failures in Docker.
- [ ] Implement command validation, persistence and task boundaries; preserve unrelated extension output and system/tool state.
- [ ] Run all tests in Docker; inspect results and fix only demonstrated failures.

## Task 3: Package, documentation and acceptance

**Files:** Create `README.md`; update `package.json` and tests as needed.

- [ ] Document local-path Pi package installation using the verified CLI syntax, RPC-side loading, reload/restart requirements, commands, default state and rollback by disabling/uninstalling.
- [ ] Document that off restores historical image transmission, current-task images can still grow large, and upstream account latency is independent.
- [ ] Add a synthetic multi-task payload test comparing JSON byte sizes and image counts; no image contents or credentials in logs.
- [ ] Verify install/package discovery and extension registration against the supported real SDK in Docker without provider calls. Use a disposable packaging target, never publish to a registry.
- [ ] Review diff and test results; report exact checks and remaining manual Web/RPC acceptance, without claiming unperformed production validation.

## Execution Notes

This directory is not currently a Git repository. Do not initialize or commit without need/authorization; no existing source is present to isolate in a worktree. Use this checklist for progress. No subagents unless the operator explicitly requests delegation.
