# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""
Do transforms specific to l10n kind
"""

from taskgraph.transforms.base import TransformSequence

transforms = TransformSequence()


@transforms.add
def update_dependencies(config, jobs):
    for job in jobs:
        job["dependencies"].update(
            {"shippable-l10n-pre": "shippable-l10n-pre-shippable-l10n-pre"}
        )
        yield job
