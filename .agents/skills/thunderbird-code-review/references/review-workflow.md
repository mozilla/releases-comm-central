# Thunderbird Code Review Workflow

## Acquire the target

| Target | Evidence |
| --- | --- |
| Latest commit | `HEAD^..HEAD` and its message |
| Working tree | Staged and unstaged changes |
| Both | Capture each unit independently |
| Range or branch | Use the user-supplied merge-base range |

Resolve an explicit ref and confirm the diff is non-empty before review. For a
combined target, never attribute uncommitted code to the commit.

## Markdown report location

For Markdown output, after resolving the target, MUST propose this report path
outside the working tree:

```text
~/code-reviews/<repository>-<safe-branch-or-target>-<YYYY-MM-DD>-review.md
```

For example, branch `work/code-review-skill` in repository `comm` becomes
`~/code-reviews/comm-work-code-review-skill-2026-10-30-review.md`. Replace path
separators and other unsafe branch-name characters with `-`. Use a short commit
ID or `working-tree` when no branch name is useful. If the
proposed file exists, add a timestamp or numeric suffix. Ask the user to
confirm the exact path before creating its parent directory or writing the
report. Do not choose a temporary directory or a working-tree path unless the
user explicitly chooses one.

## Context and intent

Extract bug IDs from each selected commit. Use available Bugzilla records and
user-provided context to write a 3–6 sentence summary: user problem, expected
behavior, affected area, and relevant constraints. Include the summary in each
specialist review prompt.
If no context source exists, mark Expected behavior as unavailable; do not infer a
specification from a filename.

## Risk and depth

| Depth | Work |
| --- | --- |
| Quick | Expected behavior when available; high-impact correctness |
| Standard | Quick plus all applicable routing checks |
| Deep | Standard plus direct consumers, error paths, compatibility, and privacy, security, or data-loss risk |
| Adversarial Balanced | Standard or selected depth; two independent Expected behavior/correctness reviewers; one verifier |
| Adversarial Thorough | Balanced plus independent frontend and test-risk review |
| Adversarial Focused | One primary review plus one independent highest-risk-area review |

Use the risk categories in `SKILL.md`. A High-risk or large mixed patch gets a
recommendation for Adversarial review. Wait for explicit confirmation before
spawning the additional adversarial reviewers. This does not prevent authorized
specialist or patch-section reviews at the selected depth. Balanced is the
default; recommend Focused when the user asks to minimize token use.

## Review axes

Keep these results separate:

1. **Expected behavior:** Root cause, requirements, omissions, unintended behavior,
   and scope creep. Cite the context source for each finding.
2. **Standards and correctness:** Changed-code correctness, user impact,
   regression risk, Thunderbird conventions, tests, and conditional specialist
   checks.

Read surrounding source or direct consumers when needed to prove a consequence.
Check applicable guidelines for readability, naming, comments, and test
standards. Report specific guideline violations as standards findings, even
without runtime impact. Skip issues automated formatting or lint reliably
detects.

## Adversarial roles

Give each independent reviewer the patch, conceptual summary, selected unit,
and this requirement:

> Find only serious, source-supported defects. Each candidate needs a changed
> file and symbol, a concrete failure path or violated contract, user or system
> impact, and a correction direction. Return `none` when no candidate meets
> this bar.

The verifier receives all candidates and deciding source. It removes duplicates,
preference-only notes, claims without supporting evidence, and issues already
fixed in the selected diff. It retains evidence-backed standards violations,
including readability and naming findings. It labels any relevant older code
`Pre-existing`.

## Report template

```md
# Review summary

- Changed behavior: …
- Changed behavior: …

## Review metadata

- Target: …
- Context: …
- Checks: run …; skipped …

## Latest commit

### Expected behavior
- [ ] R-1 Major — `path`: `symbol` — impact and evidence

### Standards and correctness
- [ ] R-2 Nit — `path`: `symbol` — impact and evidence

## Working-tree changes

### Expected behavior
…

### Standards and correctness
…

## Verification evidence

- Available: …
- Not run: …
```

Omit a target unit that was not selected. State `No verified findings` rather
than inventing nits. Preserve missing context and unrun checks as limitations.

Verification evidence is limited to behavior-relevant validation, such as a
focused test result, a build result, manual reproduction, or inspected test
coverage. Do not include Git diff commands, formatting, linting, or `commlint`.
The reviewer never runs `commlint`, so do not state that it was not run.

## Re-review

After a prior review, inspect only newly changed code by default. Do not repeat
posted findings. Name a defect class when several changed sites share it. After
three review rounds, recommend reconsidering the approach instead of repeating
unbounded review/fix cycles.
