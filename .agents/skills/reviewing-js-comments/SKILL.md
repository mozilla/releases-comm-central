---
name: reviewing-js-comments
description: >-
  Use when reviewing JavaScript changes that add, modify, rely on, or should
  include inline comments or JSDoc definitions.
---

# Reviewing JavaScript Comments

Use `js-comments-rules.md` as the single source of comment requirements.

## Required Rules

Before reviewing JavaScript comments, read and apply
`../js-comments-rules.md`.

## Review Modes

Use full review by default. Report every violation of `js-comments-rules.md`.

Use material-only review only when the user requests it. Report only comments
that can cause a caller, reviewer, or tool to misunderstand implemented
behavior or use an API incorrectly.

## Per-Comment Checklist

For every changed or relevant comment, check:

1. Accuracy against the implementation.
2. Necessity: the comment adds useful information.
3. Direct wording.
4. Simplified Technical English.
5. JSDoc types, tags, and examples, when applicable.
6. Formatting.

## Review Recipe

1. Read the changed comment and related implementation.
2. For a public API, inspect consumers when the shared rules require it.
3. Apply the per-comment checklist and the shared rules.
4. Apply the selected review mode.
5. For each finding, identify the concrete misunderstanding and provide a
   replacement comment when one can fix the issue.
