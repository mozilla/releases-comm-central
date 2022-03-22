# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from __future__ import absolute_import, print_function, unicode_literals

import os

from mozpack import path as mozpath
from mozlint.types import supported_types

COMM_EXCLUSION_FILES = [os.path.join("comm", "tools", "lint", "ThirdPartyPaths.txt")]

TASKCLUSTER_EXCLUDE_PATHS = (os.path.join("comm", "suite"),)


def _apply_global_excludes(root, config):
    exclude = config.get("exclude", [])

    for path in COMM_EXCLUSION_FILES:
        with open(os.path.join(root, path), "r") as fh:
            exclude.extend([mozpath.join(root, f.strip()) for f in fh.readlines()])

    if os.environ.get("MOZLINT_NO_SUITE", None):
        # Ignore Seamonkey-only paths when run from Taskcluster
        suite_excludes = [
            mozpath.join(root, path) for path in TASKCLUSTER_EXCLUDE_PATHS
        ]
        exclude.extend(suite_excludes)

    config["exclude"] = exclude


# This makes support file paths absolute, allowing lintpref to find StaticPrefList.yaml
def _expand_support_files(root, config):
    support_files = config.get("support-files", [])
    absolute_support_files = [mozpath.join(root, f) for f in support_files]
    config["support-files"] = absolute_support_files


def lint_wrapper(paths, config, **lintargs):
    _apply_global_excludes(lintargs["root"], config)
    _expand_support_files(lintargs["root"], config)

    payload = supported_types[config.get("wrappedType", config["type"])]
    config["payload"] = config["wraps"]
    del config["wraps"]

    if config.get("wrappedType", ""):
        config["type"] = config["wrappedType"]
        del config["wrappedType"]

    if config.get("commroot", False):
        lintargs["root"] = os.path.join(lintargs["root"], "comm")
        del config["commroot"]

    return payload(paths, config, **lintargs)
