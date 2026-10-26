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

## Finding Threshold

Submit a finding only when a comment can cause a caller, reviewer, or tool to
misunderstand implemented behavior or use an API incorrectly.

Do not report a wording preference or missing conventional detail that does not
materially affect understanding.

## Review Recipe

1. Read the changed comment and related implementation.
2. For a public API, inspect consumers when the shared rules require it.
3. Apply the shared rules.
4. For each finding, identify the concrete misunderstanding and provide a
   replacement comment when one can fix the issue.
