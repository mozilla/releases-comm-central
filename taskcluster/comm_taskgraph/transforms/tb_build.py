# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import logging

from taskgraph.transforms.base import TransformSequence

from gecko_taskgraph.util.workertypes import worker_type_implementation

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


@transforms.add
def use_comm_signing_artifacts(config, jobs):
    """
    Point the macOS entitlement artifacts at comm's copies.

    gecko_taskgraph.transforms.build:add_signing_artifacts already ran on this
    kind: it resolved the {entitlement_directory} placeholders in macosx.yml and
    appended a utility.xml artifact pointing at Firefox's entitlements. Rewrite
    that path instead of appending a second artifact of the same name, which
    docker-worker would silently dedupe (its payload keys artifacts by name) but
    generic-worker would reject.
    """
    for job in jobs:
        if "macosx" not in job["label"] or "searchfox" in job["label"]:
            yield job
            continue
        for entry in job.get("worker", {}).get("artifacts", []):
            if "path" in entry:
                entry["path"] = entry["path"].replace(
                    "checkouts/gecko/security/mac/hardenedruntime/",
                    "checkouts/gecko/comm/build/macosx/hardenedruntime/v2/",
                )
        impl, _ = worker_type_implementation(
            config.graph_config, config.params, job["worker-type"]
        )
        if impl == "docker-worker":
            # For builds using docker-worker we can't use relative paths.
            # Once we switch builds to generic-worker, this can be removed.
            for entry in job.get("worker", {}).get("artifacts", []):
                if entry.get("path", "").startswith("checkouts/gecko/comm/build"):
                    entry["path"] = "/builds/worker/" + entry["path"]
        yield job
