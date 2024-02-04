# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os
from datetime import datetime, timedelta

from mach import util as mach_util
from mozpack import path as mozpath
from mozversioncontrol import MissingVCSTool
from mozversioncontrol.repoupdate import update_mercurial_repo
from python.l10n_lint import lint_strings

LOCALE = "comm-strings-quarantine"
STRINGS_REPO = "https://hg.mozilla.org/projects/comm-strings-quarantine"

PULL_AFTER = timedelta(days=2)


def comm_strings_setup(**lint_args):
    return hg_repo_setup(STRINGS_REPO, LOCALE)


def hg_repo_setup(repo: str, name: str):
    gs = mozpath.join(mach_util.get_state_dir(), name)
    marker = mozpath.join(gs, ".hg", "l10n_pull_marker")
    try:
        last_pull = datetime.fromtimestamp(os.stat(marker).st_mtime)
        skip_clone = datetime.now() < last_pull + PULL_AFTER
    except OSError:
        skip_clone = False
    if skip_clone:
        return
    try:
        update_mercurial_repo(repo, gs)
    except MissingVCSTool:
        if os.environ.get("MOZ_AUTOMATION"):
            raise
        print("warning: l10n linter requires Mercurial but was unable to find 'hg'")
        return 1
    with open(marker, "w") as fh:
        fh.flush()


def lint(paths, lintconfig, **lintargs):
    return lint_strings(LOCALE, paths, lintconfig, **lintargs)
