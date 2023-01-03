# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from python.l10n_lint import lint_strings, strings_repo_setup

LOCALE = "comm-strings-quarantine"
STRINGS_REPO = "https://hg.mozilla.org/projects/comm-strings-quarantine"


def comm_strings_setup(**lint_args):
    return strings_repo_setup(STRINGS_REPO, LOCALE)


def lint(paths, lintconfig, **lintargs):
    return lint_strings(LOCALE, paths, lintconfig, **lintargs)
