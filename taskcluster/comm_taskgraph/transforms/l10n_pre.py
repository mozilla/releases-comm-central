# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""
Create a strings build artifact to be consumed by shippable-l10n.
"""

from typing import Optional

from taskgraph.transforms.base import TransformSequence
from taskgraph.util.schema import Schema, optionally_keyed_by, resolve_keyed_by

from gecko_taskgraph.transforms.job import JobDescriptionSchema
from gecko_taskgraph.transforms.task import TaskDescriptionSchema
from gecko_taskgraph.util.attributes import release_level

transforms = TransformSequence()


class L10nPreSchema(Schema, kw_only=True):
    # l10n-pre specific
    locale_list: optionally_keyed_by("release-type", "release-level", str, use_msgspec=True)  # type: ignore  # noqa: F821
    comm_locales_file: str
    browser_locales_file: str
    # Generic
    description: str
    treeherder: TaskDescriptionSchema.__annotations__["treeherder"] = None
    shipping_phase: TaskDescriptionSchema.__annotations__["shipping_phase"] = None
    shipping_product: TaskDescriptionSchema.__annotations__["shipping_product"] = None
    attributes: TaskDescriptionSchema.__annotations__["attributes"] = None
    worker: JobDescriptionSchema.__annotations__["worker"] = None
    worker_type: TaskDescriptionSchema.__annotations__["worker_type"] = None
    use_system_python: Optional[bool] = None
    run: JobDescriptionSchema.__annotations__["run"] = None
    run_on_projects: TaskDescriptionSchema.__annotations__["run_on_projects"] = None
    optimization: TaskDescriptionSchema.__annotations__["optimization"] = None
    run_on_repo_type: TaskDescriptionSchema.__annotations__["run_on_repo_type"] = None


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
                "release-level": release_level(config.params),
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

        job["run-on-repo-type"] = ["hg"]

        yield job
