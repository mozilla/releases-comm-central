# Testing Migration Recipes

## During Development

To test migration recipes during development, use the following mach command:

```bash
./mach tb-fluent-migration-test comm/python/l10n/tb_fluent_migrations/bug_1805746_calendar_view.py
```

This will analyze your migration recipe to check that the migrate function exists,
and interacts correctly with the migration context. Once that passes, it clones
`comm-strings-quarantine` into `$OBJDIR/comm/python/l10n`, creates a reference
localization by adding your local Fluent strings to the ones in
`comm-strings-quarantine` (essentially the first part of the cross-channel
process).

It then runs the migration recipe, both as dry run and as actual migration.
Finally it analyzes the commits, and checks if any migrations were actually run
and the bug number in the commit message matches the migration name.

It will also show the diff between the migrated files and the reference, ignoring
blank lines.

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
