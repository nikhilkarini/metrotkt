# Phase Prompts

Use one focused prompt at a time. Replace bracketed fields with the current task details and provide the relevant project documents.

## Requirements review

Read `PROJECT_BRIEF.md` and `REQUIREMENTS.md`. Do not write code. Separate confirmed facts, proposed defaults, and unresolved decisions. Find contradictions or missing acceptance criteria, especially around route modes, fare slab boundaries, passenger count, ticket expiry, and exiting at a different station. Recommend precise questions and update documents only after I approve the decisions.

## Architecture review

Read `REQUIREMENTS.md` and `ARCHITECTURE.md`. Check that every Must requirement has an API/data-flow design. Review Dijkstra state for interchange penalties, fare recomputation, payment idempotency, HMAC token verification, ticket state transitions, database transaction boundaries, and admin authorization. Report risks and proposed changes without implementing them.

## Plan the next slice

Read `AGENTS.md`, the relevant requirements and architecture sections, and inspect the repository. Do not implement yet. Plan only this task: [TASK]. Include requirement IDs, expected behavior, likely files, dependencies, acceptance checks, risks, and out-of-scope work. Identify unresolved decisions that block it.

## Implement one slice

Implement only [TASK] from the approved plan. Inspect relevant code and tests first. Follow `AGENTS.md` and the project documents. Make the smallest coherent change, add/update checks, run the narrowest relevant checks, inspect the diff, update documentation if needed, and report actual results and remaining gaps. Do not broaden scope silently.

## Review a change

Review the current diff against `REQUIREMENTS.md` and `ARCHITECTURE.md`. Look for correctness errors, route/fare manipulation, payment duplication, QR/token weaknesses, invalid ticket transitions, concurrency issues, authorization/privacy problems, accessibility gaps, missing checks, unnecessary dependencies, and scope creep. Report findings by severity with file and line references. Do not change files until I approve a fix plan.

## Verify the demo

Use `QUALITY_AND_RELEASE.md` to verify the current implementation. Run only checks available in the repository and report exact commands and observed results. Cover quote, server fare recomputation, simulated payment success/failure/retry, QR verification, entry replay, exit behavior, and admin access. List untested areas and known limitations. Do not deploy or alter external systems.
