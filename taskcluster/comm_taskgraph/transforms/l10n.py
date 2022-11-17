# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""
Do transforms specific to l10n kind
"""

from taskgraph.transforms.base import TransformSequence
from taskgraph.util.schema import resolve_keyed_by
from gecko_taskgraph.util.attributes import (
    task_name,
)

transforms_pregecko = TransformSequence()
transforms_postgecko = TransformSequence()


@transforms_postgecko.add
def update_dependencies(config, jobs):
    for job in jobs:
        job["dependencies"].update(
            {"shippable-l10n-pre": "shippable-l10n-pre-shippable-l10n-pre"}
        )
        yield job


@transforms_pregecko.add
def setup_name(config, jobs):
    for job in jobs:
        dep = job["primary-dependency"]
        # Set the name to the same as the dep task, without kind name.
        # Label will get set automatically with this kinds name.
        job["name"] = job.get("name", task_name(dep))
        yield job


@transforms_pregecko.add
def handle_keyed_by(config, jobs):
    """Resolve fields that can be keyed by platform, etc."""
    for job in jobs:
        resolve_keyed_by(
            job,
            "locales-file",
            item_name=job["name"],
            **{"release-type": config.params["release_type"]},
        )
        yield job
