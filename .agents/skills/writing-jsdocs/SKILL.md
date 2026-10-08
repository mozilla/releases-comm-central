---
name: writing-jsdocs
description: >-
  Use when writing or updating JSDoc comments in JavaScript, especially custom
  elements, public APIs, workflow methods, params, returns, @type annotations,
  typedefs, side effects, or stale comments.
---

# Writing JSDocs

## Overview

Write JSDoc from the implementation outward. Accurate, specific comments beat
polished comments that describe the wrong behavior.

## Required Rule Set

Before writing JSDoc, read and apply `../jsdoc-rules.md`.

## Quick Reference

- **Function JSDoc:** Document exported classes, shared APIs, reusable custom
  elements, top-level functions, workflow-facing methods, and non-trivial
  helpers.
- **Consumers:** For exported/shared APIs, inspect imports, call sites, tests,
  or component usage before writing docs.
- **Summary:** State actual behavior, not intent.
- **Generated-comment quality:** State exact behavior and any supported
  user-facing effect. Reject invented context, generic filler, and undefined
  abstractions. See `../jsdoc-rules.md` for examples and the full contract.
- **`@param`:** Match implementation parameter names exactly and describe each
  parameter.
- **`@returns`:** Include when a value or meaningful promise is returned.
  Describe fields consumers read.
- **`@throws` and defaults:** Document caller-triggerable errors and
  optional/config defaults.
- **Side effects:** Document consumer-visible mutation, validation,
  accessibility changes, normalization, async behavior, and dispatched events.
- **Custom elements:** Add class docs for role, template ID, tag name, slots,
  attributes, observed-attribute behavior, and public events.
- **`@type`:** Match the annotated value's real shape or existing symbol.

## Workflow

1. Read the function body or annotated value.
2. For exported or shared APIs, search outside usage before drafting docs.
3. Draft the summary, params, returns, and any type annotation from
   implementation plus consumer needs.
4. State exact behavior and any supported user-facing effect. Reject invented
   context, generic filler, and undefined abstractions. See
   `../jsdoc-rules.md` for examples and the full contract.
5. Add throws, defaults, side effects, events, and custom-element contract
   details when callers or markup consumers rely on them.
6. Compare every documented name and type against the code and consumers.
7. Remove vague or invented types when a structural type is clearer.

## Common Mistakes

- Writing a generic summary before reading the implementation.
- Writing only user-facing intent and omitting the code contract.
- Inventing call-site or motivation context that the code and consumers do not
  establish.
- Documenting an exported function without checking how outside code calls it.
- Omitting function JSDoc because the code is short but non-trivial.
- Omitting `@throws`, defaults, side effects, events, or custom-element
  contract details for a non-trivial public API.
- Adding `@type` with a plausible domain name that does not match the value.
- Preserving stale JSDoc after changing implementation behavior.
