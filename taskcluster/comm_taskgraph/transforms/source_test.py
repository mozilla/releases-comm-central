# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import logging
import os

import taskgraph
from taskgraph.transforms.base import TransformSequence

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
            if "always" in job["optimization"]:
                yield job
                continue
            del job["optimization"]
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
