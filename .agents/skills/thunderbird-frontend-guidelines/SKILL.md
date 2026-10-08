---
name: thunderbird-frontend-guidelines
description: >-
  Use when reviewing, writing, or proposing Thunderbird front-end code,
  including JavaScript, HTML, CSS, custom elements, DOM visibility, state
  management, UI tests, JSDoc, lazy loading, dataset, classList, design tokens,
  and mail/base/docs guidance.
---

# Thunderbird Front-End Guidelines

## Overview

Use this skill before you review, write, or propose Thunderbird front-end code.
It is a checklist for common standards that are easy to miss under time
pressure.

## Required Gates

Before giving a review, patch, or proposal, check these gates:

| Area | Required check |
| --- | --- |
| Tests | Treat new code without tests as a red flag. |
| Docs | Search `mail/base/docs/` for docs for the affected feature. |
| Custom elements | Follow `mail/base/docs/custom_element_conventions.md`. |
| State | Follow `mail/base/docs/state_management.md`. |
| Front-end tests | Use `thunderbird-frontend-testing-guidelines` for test files. |
| JSDoc | Ensure JSDocs are accurate; use `reviewing-jsdocs` to validate them. |
| Modern platform | Use new browser features when possible. |

Relevant docs include examples such as `quick_filter_bar.md` for Quick Filter
Bar work.

For reviews, report applicable gate failures as findings. Do not silently apply
only general style advice.

## Review Output Contract

When reviewing front-end code, include a finding when any of these conditions is
present:

- New behavior, markup, or UI state has no automated test.
- Code uses `setAttribute()` or `getAttribute()` for `data-*` attributes instead
  of `dataset`.
- Code assigns or appends to `className` instead of using `classList`.
- HTML has an `id` attribute that is not the first attribute.
- Work touches a documented feature but the related `mail/base/docs/` file was
  not checked or followed.
- CSS uses an ID selector, a generic selector, physical spacing, or a hard-coded
  value where a token or variable should be used.
- Custom element work does not follow
  `mail/base/docs/custom_element_conventions.md`.
- State-management work does not follow `mail/base/docs/state_management.md`.

## General Standards

- Allow exceptions for URLs, complex JavaScript selectors, and strings that are
  difficult to split cleanly.
- Prefer pure CSS for DOM visibility manipulation.
- Follow existing file loading patterns.
- Prefer lazy loading when a dependency is not always needed.

## JavaScript

- Flag `setAttribute("data-*", value)` and `getAttribute("data-*")` in review.
- Use `dataset` to read or modify custom `data-*` attributes.
- Flag direct `className` assignment, string concatenation, and string appends
  in review.
- Use `classList` to modify element class names.
- Pay attention to how the file is loaded before you add imports.
- Prefer lazy loading for code that is not needed during startup or initial UI
  load.
- Verify JSDoc text, params, return values, types, side effects, and examples.

## HTML

- If an element has an `id` attribute, `id` must be the first attribute.
- Follow the 80 character limit.
- Split long elements across lines, one attribute per line.
- Put the closing `>` on its own line for multi-line elements.

Incorrect:

```html
<tb-banner id="exchangeTypeUnsupportedOAuthBanner" variant="warning" expanded="true" hidden="hidden" role="alert">
  <span slot="title" data-l10n-id="account-hub-oauth-unsupported-title"></span>
  <span slot="description" data-l10n-id="account-hub-oauth-unsupported-description">
    <a href="https://support.thunderbird.net/kb/tb-custom-oauth" data-l10n-name="oauth-support-link"></a>
    <input type="number" min="0" max="10000" step="100" class="oauth-text-input" />
  </span>
</tb-banner>
```

Correct:

```html
<tb-banner
  id="exchangeTypeUnsupportedOAuthBanner"
  variant="warning"
  expanded="true"
  hidden="hidden"
  role="alert"
>
  <span
    slot="title"
    data-l10n-id="account-hub-oauth-unsupported-title"
  ></span>
  <span
    slot="description"
    data-l10n-id="account-hub-oauth-unsupported-description"
  >
    <a
      href="https://support.thunderbird.net/kb/tb-custom-oauth"
      data-l10n-name="oauth-support-link"
    ></a>
    <input
      type="number"
      min="0"
      max="10000"
      step="100"
      class="oauth-text-input"
    />
  </span>
</tb-banner>
```

## CSS

- Prefer variables and design tokens. Look for hard-coded values that could use
  an existing `var()`.
- For spacing and positioning, use logical properties such as
  `margin-inline`, `margin-block`, `padding-inline`, and `padding-block`.
- Avoid generic selectors. Avoid IDs in selectors. Use classes when possible.

## Quick Review Checklist

- Are tests added or updated for new behavior?
- Did you search `mail/base/docs/` for feature-specific guidance?
- Does custom element work follow `custom_element_conventions.md`?
- Does state work follow `state_management.md`?
- Are lines under 80 characters unless there is a clear exception?
- Is visibility handled in CSS when possible?
- Are imports lazy when the code path is not always used?
- Are `dataset` and `classList` used instead of attribute/class strings?
- Did you flag every `setAttribute("data-*")`, `getAttribute("data-*")`,
  and `className` mutation?
- Are HTML `id` attributes first?
- Are long HTML attributes split across lines?
- Are CSS tokens, logical properties, classes, and low specificity used?

## Common Mistakes

- Calling a UI change test-free because it is small: ask for a test or explain
  why no automated test is practical.
- Using `setAttribute("data-name", value)`: use
  `element.dataset.name = value`.
- Appending to `className`: use `element.classList.add/remove/toggle()`.
- Using `margin-left` or `padding-top` by default: use logical inline/block
  properties.
- Adding `#id` selectors: prefer class selectors.
- Hard-coding colors or spacing: check for a design token or CSS variable.
- Copying a similar JSDoc: update and validate it with `reviewing-jsdocs`.
- Editing Quick Filter UI without reading docs: check
  `mail/base/docs/quick_filter_bar.md`.

## Red Flags

- New front-end code has no test coverage.
- JSDoc is copied from nearby code without verification.
- JavaScript controls visibility that CSS can control.
- A new eager import affects startup or initial UI load.
- HTML has `id` after other attributes.
- CSS uses IDs, generic selectors, physical spacing, or hard-coded tokens.
