# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""
Transform hack for nightly bouncer location snafu
"""


def mangle_bouncer_location_payload(config, tasks):
    """
    Force set bouncer version to 106.0a1 as a path to getting it from 105.0a1->107.0a1.
    This needs to run once, then get backed out.
    """
    for task in tasks:
        task_def = task["task"]
        if task_def.get("payload", {}):
            task_def["payload"]["version"] = "106.0a1"

        yield task
