# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""
Fix-ups for comm-central merge automation
"""

import os
import re

from taskgraph.transforms.base import TransformSequence

from comm_taskgraph import COMM

transforms = TransformSequence()


def do_suite_verbump(replacements):
    """Bump the minor version of suite version files."""
    allowed_files = ("suite/config/version.txt", "suite/config/version_display.txt")
    old_version, new_version = None, None

    new_replacements = []
    for file, old, new in replacements:
        if file not in allowed_files:
            break
        if old_version is None or new_version is None:
            path = os.path.join(COMM, file)
            data = open(path).read()
            match = re.match(r"^(2)\.(\d+)(a1)$", data)
            if match:
                old_version = match.group(0)

                old_minor = match.group(2)
                new_minor = str(int(old_minor) + 1)

                new_version = f"{match.group(1)}.{new_minor}{match.group(3)}"

        new_replacements.append([file, old_version, new_version])

    if len(new_replacements) == len(replacements):
        return new_replacements
    else:
        raise Exception(f"do_suite_version failed: {replacements}, {new_replacements}")


@transforms.add
def update_suite_versions(config, tasks):
    for task in tasks:
        if "merge_config" not in config.params:
            break
        behavior = config.params["merge_config"]["behavior"]
        if behavior == "comm-bump-central":
            merge_config = task["worker"]["merge-info"]
            replacements = merge_config["replacements"]
            merge_config["replacements"] = do_suite_verbump(replacements)

        yield task
