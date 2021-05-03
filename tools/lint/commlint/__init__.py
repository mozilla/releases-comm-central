# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from __future__ import absolute_import, print_function, unicode_literals

import os

from mozpack import path as mozpath
from mozlint.pathutils import findobject

COMM_EXCLUSION_FILES = [os.path.join("comm", "tools", "lint", "ThirdPartyPaths.txt")]

TASKCLUSTER_EXCLUDE_PATHS = (
    os.path.join("comm", "editor"),
    os.path.join("comm", "suite"),
)


def _apply_global_excludes(root, config):
    exclude = config.get("exclude", [])

    for path in COMM_EXCLUSION_FILES:
        with open(os.path.join(root, path), "r") as fh:
            exclude.extend([f.strip() for f in fh.readlines()])

    if os.environ.get("MOZLINT_NO_SUITE", None):
        # Ignore Seamonkey-only paths when run from Taskcluster
        suite_excludes = [
            mozpath.join(root, path) for path in TASKCLUSTER_EXCLUDE_PATHS
        ]
        exclude.extend(suite_excludes)

    config["exclude"] = exclude


def lint_wrapper(paths, config, **lintargs):
    _apply_global_excludes(lintargs["root"], config)

    payload = findobject(config["wraps"])
    config["payload"] = config["wraps"]
    del config["wraps"]

    if config.get("commroot", False):
        lintargs["root"] = os.path.join(lintargs["root"], "comm")
        del config["commroot"]

    return payload(paths, config, **lintargs)
