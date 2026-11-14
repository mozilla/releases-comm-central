---
name: thunderbird-code-review
description: Use when reviewing a local comm-central Git or jj patch, especially Thunderbird frontend JavaScript, HTML, CSS, Fluent, or frontend tests.
---

# Thunderbird Code Review

Review only the selected patch. Prefer verified findings over speculative nits.

## Setup

Ask for choices the user has not already made in one interactive question
prompt when available; otherwise ask in chat. Use the defaults when the user
accepts them:

| Choice | Options |
| --- | --- |
| Target | Latest commit (default), working tree, both, range/branch |
| Depth | Standard (default), Quick, Deep, Adversarial |
| Output | Chat (default), Markdown report file |

For a selected commit, extract `Bug NNNNNN` from its message and fetch the
Bugzilla record when available. State what context was found. If context is
unavailable, ask for an issue, design document, or expected behavior before
running the Expected behavior review. Continue standards review when context
is unavailable.

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

## Specialist reviews

When subagents are available and authorized, delegate applicable review axes to
focused subagents, including a dedicated JS comments and JSDoc reviewer. Give
each the selected diff, target unit, exact file or section boundaries, context,
and applicable skill; require the subagent to load and apply that skill and
report evidence-backed findings and coverage. Split large patches into
manageable, non-overlapping sections as needed and track coverage of every
changed file. Review cross-section interactions and verify, deduplicate, and
consolidate findings. Follow higher-priority permission requirements before
dispatching.

When subagents cannot be used, perform each applicable specialist review
separately and report any coverage limitations.

## Risk and adversarial review

Classify CSS-only, documentation-only, Fluent copy-only, and simple markup-only
changes as Low. Classify frontend JavaScript, behavioral HTML, all test-only
changes, custom elements, and mixed UI patches as Medium. Classify `*.sys.mjs`,
storage or migration, accounts/authentication, network/protocol, preferences,
permissions, telemetry, build, and CI changes as High.

Recommend Adversarial review for High-risk or large mixed patches, but do not
start its additional adversarial agents until the user confirms. Use its
Balanced mode by default; recommend Focused mode when the user asks to minimize
token use.

## Finding threshold

For correctness findings, provide a changed file and stable symbol, observed
behavior, supporting contract or consumer effect, concrete impact, and
correction when clear. For standards findings, cite the applicable guideline,
the changed code, the specific violation, and a clear correction; readability
and naming violations do not require a runtime failure. Apply the full review
mode of specialist skills unless the user requests a narrower review. Label
relevant old code `Pre-existing`. Do not report preference-only issues or issues
that automated formatting or lint reliably catches.

## Finding severity

Assign each finding one severity based on its demonstrated impact, scope,
likelihood, and available workaround. Patch risk is not finding severity.

| Severity | Use for |
| --- | --- |
| Major | Serious harm or loss of essential functionality, such as data loss, a security exposure, or a crash in a common flow. |
| Moderate | A meaningful regression or incorrect behavior with limited scope or a practical workaround. |
| Minor | A limited defect or standards violation that can mislead a reader or make maintenance materially harder, such as incorrect documentation. |
| Nit | A specific guideline violation with a small readability or consistency cost but no material misunderstanding, such as a vague local name; not a personal preference. |

## Output

Under **Review summary**, include only a brief summary of the changed behavior.
Put target and context sources, checks run or skipped, and test or other
verification evidence in later named sections. Keep **Expected behavior** and
**Standards and correctness** findings separate. Label each finding with its
severity and order findings from Major to Nit within each section. Assign unique
checkbox IDs such as `R-1`. For combined targets, keep latest-commit and
working-tree findings separate.

In **Verification evidence**, include only behavior-relevant validation. Do not
include Git diff mechanics, formatting, linting, or `commlint`; a review never
runs `commlint`.
