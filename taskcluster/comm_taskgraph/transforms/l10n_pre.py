# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""
Create a strings build artifact to be consumed by shippable-l10n.
"""


from taskgraph.transforms.base import TransformSequence
from taskgraph.util.schema import resolve_keyed_by

transforms = TransformSequence()


@transforms.add
def handle_keyed_by(config, jobs):
    """Resolve fields that can be keyed by platform, etc."""
    for job in jobs:
        resolve_keyed_by(
            job,
            "locale-list",
            item_name=job["name"],
            **{"release-type": config.params["release_type"]},
        )
        yield job


@transforms.add
def make_job_description(config, jobs):
    for job in jobs:
        locale_list = job.pop("locale-list")
        comm_locales_file = job.pop("comm-locales-file")
        browser_locales_file = job.pop("browser-locales-file")
        job["run"].update(
            {
                "job-script": "comm/taskcluster/scripts/build-l10n-pre.sh",
                "options": [
                    f"locale-list={locale_list}",
                    f"comm-locales-file={comm_locales_file}",
                    f"browser-locales-file={browser_locales_file}",
                ],
            }
        )

        yield job
