---
name: thunderbird-code-review
description: Use when reviewing a local comm-central Git or jj patch, especially Thunderbird frontend JavaScript, HTML, CSS, Fluent, or frontend tests; also use when reviewing a Thunderbird Phabricator revision.
---

# Thunderbird Code Review

Review only the selected patch. Prefer verified findings over speculative nits.

## Setup

Ask for these choices in one prompt; use the defaults when the user accepts
them:

| Choice | Options |
| --- | --- |
| Target | Latest commit (default), working tree, both, range/branch, revision |
| Depth | Standard (default), Quick, Deep, Adversarial |
| Output | Chat (default), Markdown report file |

For a selected commit, extract `Bug NNNNNN` and `DNNNNNN` from its message.
Fetch available Bugzilla and Phabricator records, then state what context was
found. If neither source exists, ask for an issue, design document, or expected
behavior before running the Expected behavior review. Continue standards review when
context is unavailable.

The selected diff is authoritative. See [the workflow](references/review-workflow.md)
and [validation scenarios](references/validation.md) for details.

## Review routing

Classify the changed files before choosing checks.

- Frontend files: **REQUIRED SUB-SKILL:** use `thunderbird-frontend-guidelines`.
- Frontend tests: **REQUIRED SUB-SKILL:** use `thunderbird-frontend-testing-guidelines`.
- Changed JS comments or JSDoc: **REQUIRED SUB-SKILL:** use `reviewing-js-comments`.
- Renamed, moved, or restructured Fluent strings: **REQUIRED SUB-SKILL:** use
  `fluent-migration`.
- Legacy `.properties` or DTD strings moved to Fluent: **REQUIRED SUB-SKILL:**
  use `migrating-ui-strings-to-fluent`.
- UI semantics, keyboard behavior, ARIA, or contrast-sensitive styling:
  **REQUIRED SUB-SKILL:** use `accessibility-frontend-review` for a dedicated
  accessibility review when the selected depth or user request includes it.
- Shared `toolkit/` UI code: also use `firefox-desktop-frontend`; Thunderbird
  conventions take priority for `comm/` files.

List checks that did not apply. Do not claim a clean whole-patch review for
excluded file types.

## Risk and adversarial review

Classify CSS-only, documentation-only, Fluent copy-only, and simple markup-only
changes as Low. Classify frontend JavaScript, behavioral HTML, all test-only
changes, custom elements, and mixed UI patches as Medium. Classify `*.sys.mjs`,
storage or migration, accounts/authentication, network/protocol, preferences,
permissions, telemetry, build, and CI changes as High.

Recommend Adversarial review for High-risk or large mixed patches, but do not
start extra agents until the user confirms. Use its Balanced mode by default;
recommend Focused mode when the user asks to minimize token use.

## Finding threshold

Report a finding only with a changed file and stable symbol, observed behavior,
supporting contract or consumer effect, concrete impact, and correction when
clear. Label relevant old code `Pre-existing`. Do not report formatting, lint,
or preference-only issues.

## Output

Under **Review summary**, include only a brief summary of the changed behavior.
Put target and context sources, checks run or skipped, and test or other
verification evidence in later named sections. Keep **Expected behavior** and
**Standards and correctness** findings separate. Use severity-ordered checkbox
IDs such as `R-1`. For combined targets, keep latest-commit and working-tree
findings separate.

In **Verification evidence**, include only behavior-relevant validation. Do not
include Git diff mechanics, formatting, linting, or `commlint`; a review never
runs `commlint`.
