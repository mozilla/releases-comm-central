# Testing Migration Recipes

## During Development

To test migration recipes during development, use the following mach command:

```bash
./mach tb-fluent-migration-test comm/python/l10n/tb_fluent_migrations/bug_1805746_calendar_view.py
```

This will analyze your migration recipe to check that the `migrate` function
exists and interacts correctly with the migration context. Once that passes, it
clones `thunderbird-l10n-source`, creates a reference localization by adding your
local Fluent strings to the ones in `thunderbird-l10n-source`, and runs the
migration recipe both as a dry run and as an actual migration. Finally, it
analyzes the generated commits and migrated strings and prints a summary of any
problems it finds.

In most cases, a successful execution will only output the script execution,
with no summary.

### Reading the diff

When there are differences between the migrated files and the reference content,
the command prints a unified diff for each affected file. Blank lines are
automatically ignored. The diff is a visual aid only; the classification of each
difference is in the summary described below.

There are cases where a diff is expected even if the recipe is correct:

- If the patch includes new strings that are not being migrated, the diff output
  will show these as removals. The migration test contains the latest version of
  strings from `thunderbird-l10n-source` with only migrations applied, while the
  reference file contains all string changes from the patch.
- If there are pending changes to FTL files included in the recipe that landed
  recently and have not yet been pushed to `thunderbird-l10n-source`, these will
  show up as additions.

Both cases involve messages that are not migrated by the recipe, so they are
reported as ignorable `INFO` notes in the summary.

### Test summary

After the script execution and any diff, the command prints a summary grouping
all findings by severity, with ignorable notes first and errors last. The
severity levels are:

- `INFO`: messages that differ in the diff but are not migrated by the recipe.
  These should be safe to ignore and cover the expected-diff cases above.
- `WARNING`: a migrated message that differs from the reference only in
  capitalization. These are often acceptable but worth reviewing.
- `ERROR`: a problem with the recipe. The command exits with a non-zero status
  whenever any error is reported. Errors include:

  - A message that is part of the recipe but was not migrated.
  - A migrated message whose value differs from the reference beyond
    capitalization.
  - An attempt to migrate a message from the same ID in the same file.
  - A missing or wrong bug number, or commit messages without `part {index}`.

You can inspect the generated repository further by looking in
`$OBJDIR/comm/python/l10n/bug_1805746_calendar_view/en-US`.

## During Review

During l10n review, migration scripts will be run against all Thunderbird locales.
Any problems will be reported back to the author as part of the regular code
review process in Phabricator.

```{tip}
Plan on extra review time for migration scripts in case changes are needed.

Ask the Thunderbird L10n coordinator in [#maildev](https://matrix.to/#/#maildev:mozilla.org)
or your manager if you run into problems.
```
