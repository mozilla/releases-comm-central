# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""
Create a strings build artifact to be consumed by shippable-l10n.
"""

from taskgraph.transforms.base import TransformSequence
from taskgraph.util.schema import Schema, optionally_keyed_by, resolve_keyed_by
from voluptuous import Optional, Required

from gecko_taskgraph.transforms.job import job_description_schema
from gecko_taskgraph.transforms.task import task_description_schema
from gecko_taskgraph.util.attributes import release_level

transforms = TransformSequence()

l10n_pre_schema = Schema(
    {
        # l10n-pre specific
        Required("locale-list"): optionally_keyed_by("release-type", "release-level", str),
        Required("comm-locales-file"): str,
        Required("browser-locales-file"): str,
        # Generic
        Required("description"): str,
        Optional("treeherder"): task_description_schema["treeherder"],
        Optional("shipping-phase"): task_description_schema["shipping-phase"],
        Optional("shipping-product"): task_description_schema["shipping-product"],
        Optional("attributes"): task_description_schema["attributes"],
        Optional("worker"): job_description_schema["worker"],
        Optional("worker-type"): task_description_schema["worker-type"],
        Optional("use-system-python"): bool,
        Optional("run"): job_description_schema["run"],
        Optional("run-on-projects"): task_description_schema["run-on-projects"],
        Optional("optimization"): task_description_schema["optimization"],
    }
)


@transforms.add
def handle_keyed_by(config, jobs):
    """Resolve fields that can be keyed by platform, etc."""
    for job in jobs:
        resolve_keyed_by(
            job,
            "locale-list",
            item_name=job["name"],
            **{
                "release-type": config.params["release_type"],
                "release-level": release_level(config.params["project"]),
            },
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
