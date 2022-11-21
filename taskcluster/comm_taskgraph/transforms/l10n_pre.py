# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""
Create a strings build artifact to be consumed by shippable-l10n.
"""

import json
import os

from gecko_taskgraph import GECKO
from gecko_taskgraph.loader.single_dep import schema
from gecko_taskgraph.transforms.job import job_description_schema
from gecko_taskgraph.transforms.task import task_description_schema
from taskgraph.transforms.base import TransformSequence
from taskgraph.util.schema import optionally_keyed_by, resolve_keyed_by
from voluptuous import Match, Optional, Required

l10n_description_schema = schema.extend(
    {
        # Name for this job, inferred from the dependent job before validation
        Required("name"): str,
        # build-platform, inferred from dependent job before validation
        Required("build-platform"): str,
        # max run time of the task
        Required("run-time"): int,
        # All l10n jobs use mozharness
        Required("mozharness"): {
            # Script to invoke for mozharness
            Required("script"): str,
            # Config files passed to the mozharness script
            Required("config"): [str],
            # Additional paths to look for mozharness configs in. These should be
            # relative to the base of the source checkout
            Optional("config-paths"): [str],
            # Options to pass to the mozharness script
            Optional("options"): [str],
            # Action commands to provide to mozharness script
            Required("actions"): [str],
            # if true, perform a checkout of a comm-central based branch inside the
            # gecko checkout
            Optional("comm-checkout"): bool,
        },
        # Description of the localized task
        Required("description"): str,
        Optional("run-on-projects"): job_description_schema["run-on-projects"],
        # worker-type to utilize
        Required("worker-type"): task_description_schema["worker-type"],
        # This object will be passed through to the task description
        Optional("worker"): dict,
        # File which contains the used locales
        Required("locale-list"): optionally_keyed_by("release-type", str),
        # File containing revision of l10n-comm monorepo to use
        Required("comm-locales-file"): str,
        # File containing revisions of l10n-central repos to use for toolkit strings
        Required("browser-locales-file"): str,
        # Docker image required for task.  We accept only in-tree images
        # -- generally desktop-build or android-build -- for now.
        Optional("docker-image"): {"in-tree": str},
        # Information for treeherder
        Required("treeherder"): {
            # Platform to display the task on in treeherder
            Required("platform"): Match("^[A-Za-z0-9_-]{1,50}/[A-Za-z0-9_-]{1,50}$"),
            # Symbol to use
            Required("symbol"): str,
            # Tier this task is
            Required("tier"): int,
        },
        # Task deps to chain this task with, added in transforms from primary-dependency
        # if this is a shippable-style build
        Optional("dependencies"): {str: str},
        # passed through directly to the job description
        Optional("attributes"): job_description_schema["attributes"],
        # Shipping product and phase
        Optional("shipping-product"): task_description_schema["shipping-product"],
        Optional("shipping-phase"): task_description_schema["shipping-phase"],
    }
)


transforms = TransformSequence()

transforms.add_validate(l10n_description_schema)


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


def _read_revision_file(revision_file):
    """Read revision information from JSON file."""
    revision_file = os.path.abspath(os.path.join(GECKO, revision_file))
    with open(revision_file, "r") as fp:
        data = json.load(fp)
        revision = data.get("revision", None)
        if revision is None:
            raise Exception(f"Unable to read revision from {revision_file}")
        return revision


@transforms.add
def make_job_description(config, jobs):
    for job in jobs:
        locale_list = job.pop("locale-list")
        comm_locales_file = job.pop("comm-locales-file")
        browser_locales_file = job.pop("browser-locales-file")
        job["mozharness"].update(
            {
                "using": "mozharness",
                "job-script": "comm/taskcluster/scripts/build-l10n-pre.sh",
                "options": [
                    f"locale-list={locale_list}",
                    f"comm-locales-file={comm_locales_file}",
                    f"browser-locales-file={browser_locales_file}",
                ],
            }
        )
        worker = {
            "max-run-time": job["run-time"],
            "chain-of-trust": True,
        }
        worker.update(job.get("worker", {}))

        job_description = {
            "name": job["name"],
            "worker-type": job["worker-type"],
            "description": job["description"],
            "run": job["mozharness"],
            "attributes": job["attributes"],
            "treeherder": {
                "kind": "build",
                "tier": job["treeherder"]["tier"],
                "symbol": job["treeherder"]["symbol"],
                "platform": job["treeherder"]["platform"],
            },
            "run-on-projects": job.get("run-on-projects", []),
            "worker": worker,
        }

        if job.get("docker-image"):
            job_description["worker"]["docker-image"] = job["docker-image"]

        if job.get("dependencies"):
            job_description["dependencies"] = job["dependencies"]

        if "shipping-phase" in job:
            job_description["shipping-phase"] = job["shipping-phase"]

        if "shipping-product" in job:
            job_description["shipping-product"] = job["shipping-product"]

        yield job_description
