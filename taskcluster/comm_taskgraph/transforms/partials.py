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


def identify_desired_signing_keys(project, product):
    if project == "comm-central":
        return "nightly"
    if project in ["comm-beta, comm-release"] or project.startswith("comm-esr"):
        return "release"
    return "dep1"


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

        # The signing keys are dependent on the project name. Set them here.
        task["payload"]["env"]["SIGNING_CERT"] = (
            identify_desired_signing_keys(
                config.params["project"], config.params["release_product"]
            ),
        )

        yield job
