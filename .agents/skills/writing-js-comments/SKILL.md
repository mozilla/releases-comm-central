---
name: writing-js-comments
description: >-
  Use when writing or updating comments in JavaScript, including inline
  comments and JSDoc definitions for public APIs.
---

# Writing JavaScript Comments

Use `js-comments-rules.md` as the single source of comment requirements.

## Required Rules

Before writing a JavaScript comment, read and apply
`../js-comments-rules.md`.

## Workflow

1. Read the code that the comment will describe.
2. For exported or shared APIs, inspect consumers before writing JSDoc.
3. Apply the shared rules to decide whether a comment is needed and what it
   must state.
4. Re-read the implementation and consumers before finalizing the comment.
