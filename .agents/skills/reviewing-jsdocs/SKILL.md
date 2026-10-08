---
name: reviewing-jsdocs
description: >-
  Use when reviewing JavaScript changes that add, modify, rely on, or should
  include JSDoc comments, including function docs, @param, @returns, @type, and
  typedefs.
---

# Reviewing JSDocs

## Overview

Review JSDoc as executable-facing API documentation. A misleading comment is a
defect when it can cause callers, reviewers, or tools to misunderstand the code.

## Required Rule Set

Before reviewing JSDoc, read and apply `../jsdoc-rules.md`.

## Finding Threshold

Submit a description finding only when the current wording can cause a caller,
reviewer, or tool to misunderstand implemented behavior or use the API
incorrectly. A finding must identify that material misunderstanding.

Accept concise descriptions that give the correct overall behavior. Do not
require every condition, established domain distinction, or local fallback to be
stated when it is conventional or clear from the code. Do not report a
terminological preference, such as `recurring event` versus `occurrence`, unless
it changes the consumer-facing contract.

## Quick Reference

- **Missing function JSDoc:** An exported, top-level, or non-trivial function
  has no JSDoc.
- **Consumer contract mismatch:** The JSDoc contradicts behavior established by
  imports, call sites, tests, or component usage.
- **Misleading summary:** The description omits or contradicts implemented
  behavior.
- **`@param` mismatch:** The documented name, type, or description does not
  match the signature or property access.
- **Missing `@returns`:** The function returns meaningful data, a promise
  result, or fields consumers read.
- **Missing throws/defaults:** Caller-triggerable errors or optional/config
  defaults are undocumented.
- **Missing `@see`/`@example`:** Related material is needed to explain the
  contract, or usage is not clear from the signature, and the missing link or
  example can cause incorrect use.
- **Bad `@type`:** The annotation names the wrong symbol, an invented symbol,
  or the wrong shape.

## Review Recipe

For every changed JavaScript function or JSDoc block, verify:

1. A required function JSDoc is present.
2. Exported, shared, component, or caller-facing APIs were checked against
   consumers or tests.
3. The description matches the implementation and explains consumer-relevant
   behavior. For each possible finding, identify the concrete consumer
   misunderstanding first. Do not report it if a reader can use the API
   correctly without the extra detail.
4. Each `@param` name and optional/default marker matches the signature, and
   every tag has a useful description.
5. `@returns` exists when the function returns meaningful data, and includes
   fields consumers read.
6. Triggerable errors, defaults, side effects, dispatched events, custom-element
   contract details, related files/symbols, and non-obvious usage examples are
   documented when relevant.
7. `@type` annotations describe the actual value and reference real or
   structurally correct types.
8. The JSDoc does not promise behavior the code does not implement or hide
   behavior consumers rely on.
9. No placeholder JSDoc was added for routine lifecycle methods, obvious event
   routing, inline callbacks, or trivial accessors.
10. Comments and tag descriptions generally follow Simplified Technical English
    guidance unless exact technical terms make a longer phrase necessary.

## Review Output

Report JSDoc issues as normal review findings with file and line references.
Explain how the mismatch can mislead a consumer, then state the expected
correction. Do not report wording preferences or missing detail that has no
material effect on consumer understanding.

## Common Mistakes

- Treating JSDoc as style-only and skipping it in bug-focused reviews.
- Reviewing exported/shared JSDoc without checking how consumers call the API.
- Checking syntax but not whether the description matches implementation.
- Ignoring missing `@throws`, defaults, tag descriptions, `@see`, or examples
  because they look like documentation polish.
- Missing parameter name drift after a rename.
- Accepting a broad domain type when the annotated value is a plain object or
  state record.
- Treating a concise summary or clear inline fallback as defective because it
  omits conventional detail or uses a non-material terminology choice.
