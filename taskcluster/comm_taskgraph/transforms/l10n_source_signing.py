# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""
Transform the signing task into an actual task description.
"""

from taskgraph.transforms.base import TransformSequence
from taskgraph.util.dependencies import get_primary_dependency
from taskgraph.util.taskcluster import get_artifact_path

from gecko_taskgraph.transforms.build_signing import add_signed_routes
from gecko_taskgraph.util.attributes import copy_attributes_from_dependent_job

transforms = TransformSequence()

transforms.add(add_signed_routes)


@transforms.add
def define_upstream_artifacts(config, jobs):
    for job in jobs:
        dep_job = get_primary_dependency(config, job)

        job.setdefault("attributes", {}).update(copy_attributes_from_dependent_job(dep_job))

        artifacts_specifications = [
            {
                "artifacts": [
                    get_artifact_path(job, "strings_all.tar.zst"),
                    get_artifact_path(job, "l10n-changesets.json"),
                ],
                "formats": ["autograph_gpg"],
            }
        ]

        task_ref = f"<{dep_job.kind}>"
        task_type = "build"
        if "notarization" in dep_job.kind:
            task_type = "scriptworker"

        job["upstream-artifacts"] = [
            {
                "taskId": {"task-reference": task_ref},
                "taskType": task_type,
                "paths": spec["artifacts"],
                "formats": spec["formats"],
            }
            for spec in artifacts_specifications
        ]

        yield job
