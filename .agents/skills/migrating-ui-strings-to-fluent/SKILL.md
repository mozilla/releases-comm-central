---
name: migrating-ui-strings-to-fluent
description: Use when moving comm-central UI strings from legacy properties or DTD resources (string bundles, preference panes, dialogs) into Fluent (FTL), when reviewing such a migration or its recipe, or when updating the consumers, packaging, or tests involved in a string move. Not for copy edits confined to existing FTL messages.
---

# Migrating UI Strings to Fluent

Produce a complete migration: Fluent resources, every runtime consumer, the downstream locale migration recipe, packaging/search metadata, and locale-independent tests must agree. Preserve the user's requested scope; an assessment request is read-only, while an implementation request includes proportional validation.

## Inventory before editing

Read the repository instructions, then use `rg` to trace:

- every legacy definition and consumer;
- tests that assert the old English output;
- `jar.mn`, XHTML includes, and other packaging entries;
- `search-l10n-ids` and similar indirect references;
- existing Fluent IDs or migration transforms that might collide with the proposed IDs;
- an existing Fluent message that already covers the same UI state with newer copy. A legacy string that is byte-identical to a pre-rename FTL string is a stale twin: reconcile with the newer message instead of migrating the old wording under a new ID.

Classify each use by what the caller actually needs: static DOM localization, a dynamically created element, or a JavaScript string. Remove dead consumers instead of migrating strings that no longer serve a purpose.

## Design messages for their consumers

Choose the Fluent shape from the target element or API, not from the legacy properties shape.

- Static markup: use `data-l10n-id` and arguments, with the element's expected attributes.
- XUL menu items: normally use `.label`, plus `.tooltiptext` when the UI previously set one.
- XUL labels: a message value renders as the label's text content, while a `.value` trait is rendered from the `value` attribute through `::before`. An element must use one mechanism consistently — a plain-value message applied to a node that already has a `.value`-trait translation leaves the earlier text content in place and displays both strings side by side (the reverse direction is safe, because Fluent unsets the stale attribute).
- HTML text containers: a message value is often appropriate.
- HTML `<input>` and `<textarea>`: Fluent cannot write their `value` attribute, so use a plain-value message with `formatValue` and assign the IDL property; see "Localize dynamic UI declaratively".
- JavaScript strings for prompts, picker titles, comparisons, or non-DOM APIs: retain a message value and call `formatValue` or `formatValues`.
- If the same ID is consumed both as a JavaScript string and as DOM attributes, define both the value and the required attributes.

Fluent applies only *localizable* attributes and silently ignores the rest; it also removes localizable attributes that the message does not define. An attribute set from JavaScript (`label`, `tooltiptext`, …) therefore disappears as soon as a translation is applied, unless the message defines it. `data-l10n-attrs` explicitly allows additional attributes.

Add variable comments and preserve access keys. Avoid reshaping or redefining a message already emitted by another transform in the same migration. Consolidate the transform or introduce a new, accurately named ID; validate this with the migration test.

## Localize dynamic UI declaratively

For dynamically created elements, prefer:

```js
document.l10n.setAttributes(element, "message-id", { variable });
```

Do not eagerly format a string merely to assign `label`, `value`, `title`, or `tooltiptext`. Keeping the ID and arguments on the node supports retranslation and lets tests verify localization without depending on English.

Exception: HTML `<input>` and `<textarea>` cannot receive a translated `value` attribute at all — Fluent's attribute allow-list permits `value` only on HTML `submit`/`button`/`reset` inputs and on XUL `label`/`description` — so `setAttributes` silently does nothing there. `data-l10n-attrs="value"` makes the attribute apply, but it is still the wrong tool when the same field is also written from JavaScript: assigning the IDL `value` property sets the input's dirty value flag, after which the attribute no longer changes what is displayed and the field keeps a stale string. For readonly display fields, define a plain-value message and assign the formatted string to the property:

```js
element.value = await document.l10n.formatValue("message-id");
```

When a node alternates between localized and raw runtime data, remove both `data-l10n-id` and `data-l10n-args` before assigning the raw value. `document.l10n.removeAttributes()` is not an available API. Test transitions in both directions so a later translation cannot overwrite the raw value, and assert that the previous state's text and attributes are gone — a leftover one renders alongside the new value. The same applies to markup carrying a static `data-l10n-id` that JavaScript also writes: re-translation restores the static message and clobbers the runtime value, so drop the static ID or re-apply the runtime value.

Do not build a cache of translated strings solely to keep otherwise synchronous UI code unchanged. Prefer storing state or message IDs and localizing the target elements. This avoids async initialization/unload races.

## Use formatting APIs deliberately

Use asynchronous `document.l10n.formatValue()` or `formatValues()` when a real string is required. Make the containing event handler asynchronous and await it. Fetch related strings, such as a confirmation title and message, in one `formatValues()` call.

Keep synchronous formatting only where the surrounding interface is genuinely synchronous and an established synchronously loaded bundle is available. Await promise-returning helpers before storing their results; never let a `Promise` leak into UI state or tree data.

For mailnews C++ callers that need a string, prefer `LocalizeMessage` from `nsMsgUtils.h` with a `mozilla::intl::Localization` for the relevant FTL resources. It formats synchronously into UTF-8; pass variable names and values as UTF-8 arguments, check the returned `nsresult`, and convert to UTF-16 only at the prompt or file picker API boundary. Reuse the `Localization` instance for related calls, but avoid a pass-through `GetString` wrapper that merely calls `LocalizeMessage` and converts its result. The same applies to JavaScript: inline a helper whose body only forwards to a localization API and adds no logic.

## Audit assets and security policy

When migrated or newly tested UI exposes missing icons, inspect both the source attribute and the document CSP. Use the attribute expected by the URL producer—for example, a local icon image-set may require `srcset`, while a web favicon uses `src`. Extend `img-src` only with the schemes the feature actually needs, and add focused coverage for the resulting URL.

## Write locale-independent tests

Tests should verify the localization contract, not en-US prose.

- For declaratively localized nodes, assert `document.l10n.getAttributes(element)` including both `id` and `args`.
- Asserting IDs alone is not enough. For every localization mechanism in play (XUL `.label`, `.value` or `.tooltiptext`, an HTML input value, text content, a formatted string), also assert at least one element's assigned value or rendered text. IDs and arguments can be exactly right while the translation never reaches the UI — a trait Fluent does not apply, or an attribute the message does not define.
- When rendered text is the behavior under test, obtain the expected value from `formatValue(s)` instead of embedding English.
- Format every expected localized item in a sequence; do not leave some expectations hard-coded.
- Use boolean assertions such as `Assert.ok(condition)` rather than equality with `true` or `false`.
- Register mutation/event promises before triggering the action that causes them.
- For asynchronously initialized dialogs, wait for a semantic readiness condition such as populated data or a known runtime value, then inspect Fluent attributes. Do not synchronize on English text.

Cover meaningful transitions: initial localization, filtering or selection changes, no-selection states, localized-to-raw values, and reopening dialogs where relevant. Assert that a replaced state does not linger, in either direction.

## Keep migration and indirect references aligned

Update the en-US FTL resources and the Python migration recipe together. Mirror values, attributes, variables, and term replacements exactly. Also update packaging removals, markup references, preference-search IDs including attribute suffixes such as `.value`, and any test manifests or includes affected by the move.

Before finishing, search for removed legacy files, old message IDs, deleted JavaScript helpers, and tests still asserting the removed English or IDs. A clean direct-reference search is part of completion.

After a rebase, verify that no upstream FTL change was reverted while resolving conflicts: diff the regions you touched against the base branch and re-run the migration test, which compares the migrated output against the current en-US resources. Keeping "your" side of a conflicting hunk silently restores renamed IDs and superseded copy.

## Validate proportionally

Follow the repository's exact-file formatting rule. Know how the build serves each resource before planning test runs: plain JavaScript and FTL files are typically linked into the build and picked up live, while `*.inc.xhtml` is preprocessed into the built document and needs a rebuild before browser tests see the change — otherwise tests exercise stale markup and fail confusingly.

For an implemented migration, normally run:

1. `../mach format` with every changed filename explicitly listed.
2. `../mach tb-fluent-migration-test <recipe.py>` for the migration recipe.
3. `../mach commlint` on the changed files; distinguish unrelated pre-existing diagnostics from regressions.
4. `../mach commlint -l l10n` for every added or updated FTL file; it validates the localization files against the `l10n.toml` configurations.
5. Focused browser tests covering every changed preference pane or dialog.
6. `git diff --check`, a stale-reference `rg` pass, and a final status/diff review.

If a broad test fails after an earlier test aborts, fix the first failure before diagnosing later open-window or timeout failures; they are often fallout. Before treating a failure as yours, check whether it also reproduces on the base revision — artifact builds can produce unrelated crashes or rejected promises. After changing synchronization or cleanup logic, rerun the directly affected test rather than relying on a previous aggregate result.

## Review checklist

Before reporting completion, verify:

- no translated-string cache remains without a real need;
- dynamic elements carry Fluent IDs/arguments rather than preformatted English;
- every FTL value versus attribute matches its consumer, and each element uses a single mechanism (never plain-value and `.value`-trait messages for the same node);
- attributes the UI sets from JavaScript are also defined by the message, or the next translation removes them;
- value-bearing HTML inputs assign the formatted string through the IDL property;
- raw values clear stale Fluent attributes;
- async formatting and state updates are awaited;
- CSP and icon attributes permit the intended assets without broadening policy unnecessarily;
- tests assert the applied value or rendered text in addition to IDs and arguments, contain no avoidable en-US assertions, and install waits before actions;
- no legacy string was migrated when an existing FTL message already covers the same state with newer copy;
- the migration recipe passes and all indirect references use the final IDs;
- the working diff contains no unrelated changes.
