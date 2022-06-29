# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import logging

from taskgraph.transforms.base import TransformSequence

logger = logging.getLogger(__name__)

transforms = TransformSequence()


@transforms.add
def munge_environment(config, jobs):
    for job in jobs:
        env = job["worker"]["env"]
        # Remove MOZ_SOURCE_CHANGESET/REPO from the job environment and discard
        # if present. Having these variables set in the environment causes problems
        # with generating debug sym files. Bug 1747879.
        env.pop("MOZ_SOURCE_CHANGESET", None)
        env.pop("MOZ_SOURCE_REPO", None)

        yield job
