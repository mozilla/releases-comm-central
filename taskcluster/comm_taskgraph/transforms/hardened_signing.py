# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""
Adjust the hardened signing configuration for Thunderbird.

Runs after gecko_taskgraph.transforms.hardened_signing, which does all of the
actual work.
"""

from taskgraph.transforms.base import TransformSequence

transforms = TransformSequence()


@transforms.add
def remove_provisioning_profile_config(config, jobs):
    """
    Drop the provisioning profile configuration.

    Thunderbird has no provisioning profile of its own, but gecko_taskgraph
    assigns Firefox's to every production shippable macOS signing task.
    """
    for job in jobs:
        job["worker"].pop("provisioning-profile-config", None)
        yield job
