# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import logging
import os
import shlex

import taskgraph
from taskgraph.transforms.base import TransformSequence
from taskgraph.util.path import match as match_path

logger = logging.getLogger(__name__)

transforms = TransformSequence()


def get_patterns(job):
    """Get the "run on-changed" file patterns."""
    optimization = job.get("optimization", {})
    if optimization:
        return optimization.copy().popitem()[1]
    return []


@transforms.add
def remove_optimization_on_comm(config, jobs):
    """
    For pushes to comm-central run all source-test tasks that are enabled for
    code-review in order to have the code-review bot populate the DB according
    with the push hash.
    """
    if config.params["project"] != "comm-central" or config.params["tasks_for"] != "hg-push":
        yield from jobs
        return

    for job in jobs:
        if not job.get("attributes", {}).get("code-review", False):
            yield job
            continue
        if "when" in job:
            del job["when"]
        if "optimization" in job:
            del job["optimization"]
        yield job


@transforms.add
def changed_clang_format(config, jobs):
    """
    Transform for clang-format job to set the commandline to only check
    C++ files that were changed in the current push rather than running on
    the entire repository.
    """
    for job in jobs:
        if job.get("name", "") == "clang-format":
            prefix = config.params.get("comm_src_path")
            files_changed = config.params.get("files_changed")

            match_patterns = get_patterns(job)
            changed_files = {file for file in files_changed if file.startswith(prefix)}

            cpp_files = []
            for pattern in match_patterns:
                for path in changed_files:
                    if match_path(path, pattern):
                        cpp_files.append(path)

            # In the event that no C/C++ files were changed in the current push,
            # the commandline will end up being invalid. But, the clang-format
            # job will get dropped by optimization, so it doesn't really matter.
            if cpp_files:
                job["task-context"] = {
                    "from-object": {
                        "changed_files": shlex.join(cpp_files),
                    },
                    "substitution-fields": [
                        "run.command",
                    ],
                }

        yield job


@transforms.add
def set_base_revision_in_tgdiff(config, jobs):
    if not os.environ.get("MOZ_AUTOMATION") or taskgraph.fast:
        yield from jobs
        return

    comm_base_rev = config.params.get("comm_base_rev")

    for job in jobs:
        if job["name"] != "taskgraph-diff":
            yield job
            continue

        job["task-context"] = {
            "from-object": {
                "base_rev": comm_base_rev,
            },
            "substitution-fields": [
                "run.command",
            ],
        }
        yield job
