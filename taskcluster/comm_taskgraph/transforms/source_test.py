# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import logging
import shlex

from taskgraph.transforms.base import TransformSequence
from taskgraph.util.path import join as join_path
from taskgraph.util.path import match as match_path

from gecko_taskgraph.files_changed import get_changed_files

logger = logging.getLogger(__name__)

transforms = TransformSequence()


def get_patterns(job):
    """Get the "run on-changed" file patterns."""
    optimization = job.get("optimization", {})
    if optimization:
        return optimization.copy().popitem()[1]
    return []


def shlex_join(split_command):
    """shlex.join from Python 3.8+"""
    return " ".join(shlex.quote(arg) for arg in split_command)


@transforms.add
def changed_clang_format(config, jobs):
    """
    Transform for clang-format job to set the commandline to only check
    C++ files that were changed in the current push rather than running on
    the entire repository.
    """
    for job in jobs:
        if job.get("name", "") == "clang-format":
            repository = config.params.get("comm_head_repository")
            revision = config.params.get("comm_head_rev")

            match_patterns = get_patterns(job)
            changed_files = {
                join_path("comm", file) for file in get_changed_files(repository, revision)
            }

            cpp_files = []
            for pattern in match_patterns:
                for path in changed_files:
                    if match_path(path, pattern):
                        cpp_files.append(path)

            # In the event that no C/C++ files were changed in the current push,
            # the commandline will end up being invalid. But, the clang-format
            # job will get dropped by optimization, so it doesn't really matter.
            if cpp_files:
                job["run"]["command"] = job["run"]["command"].format(
                    changed_files=shlex_join(cpp_files)
                )

        yield job
