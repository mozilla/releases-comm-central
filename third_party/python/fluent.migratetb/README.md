# Fluent Migration Tools - Thunderbird Fork

Programmatically create Fluent files from existing content in both legacy
and Fluent formats. Use recipes written in Python to migrate content for each
of your localizations.

This is a fork for performing Thunderbird string migrations. Usage is slightly
different than upsteam due to the use of a monorepo.

`migrate-l10n` is a CLI script which uses the `fluent.migrate` module under
the hood to run migrations on existing translations.

`validate-l10n-recipe` is a CLI script to test a migration recipe for common
errors, without trying to apply it.

Installation
------------

- Clone this repo somewhere

- pip install "<path-to->/tb-fluent-migrate[hg]"

Alternatively, install right from the repo:

- pip install "fluent.migrate[hg] @ git+https://github.com/jfx2006/tb-fluent-migrate"


Usage
-----

Migrations consist of _recipes_, which are applied to a _localization repository_, based on _template files_.
You can find recipes for Thunderbird in `comm-central/python/l10n/tb_fluent_migrations/`,
the reference repository is [comm-strings-quarantine](https://hg.mozilla.org/projects/comm-strings-quarantine/) or _quarantine_.
You apply those migrations to l10n repositories in [comm-l10n](https://hg.mozilla.org/projects/comm-l10n/).

The migrations are run as python modules, so you need to have their file location in `PYTHONPATH`.

An example would look like

    $ migrate-l10n --locale it --reference-dir comm-strings-quarantine --localization-dir comm-l10n bug_1802387_langpack_defines

Upstream
--------
https://hg.mozilla.org/l10n/fluent-migration/
