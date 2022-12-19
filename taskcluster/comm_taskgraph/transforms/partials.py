# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""
Thunderbird modifications to partial update building
"""
import logging

from taskgraph.transforms.base import TransformSequence

logger = logging.getLogger(__name__)

transforms = TransformSequence()


@transforms.add
def update_scopes(config, jobs):
    """
    Firefox does some caching when building partial updates, but there's no bucket for Thunderbird
    at the moment. In the meantime, remove the scope from the task to avoid an error.
    """
    # If no balrog release history, then don't run
    if not config.params.get("release_history"):
        return

    MBSDIFF_SCOPE = "auth:aws-s3:read-write:tc-gp-private-1d-us-east-1/releng/mbsdiff-cache/"

    for job in jobs:
        task = job["task"]
        if MBSDIFF_SCOPE in task["scopes"]:
            task["scopes"].remove(MBSDIFF_SCOPE)

        yield job
