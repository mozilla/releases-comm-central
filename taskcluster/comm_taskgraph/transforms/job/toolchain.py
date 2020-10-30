# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""
Support for running toolchain-building jobs via dedicated scripts in comm-central
"""

from __future__ import absolute_import, print_function, unicode_literals

from voluptuous import Required
from taskgraph.transforms.job import (
    configure_taskdesc_for_run,
    run_job_using,
)
from taskgraph.transforms.job.toolchain import (
    toolchain_defaults,
    toolchain_run_schema,
)
from taskgraph.transforms.job.common import (
    docker_worker_add_artifacts,
)

# from taskgraph.util.hash import hash_paths
from comm_taskgraph.util.hash import hash_paths_extended as hash_paths
from taskgraph import GECKO
import taskgraph

CACHE_TYPE = "toolchains.v3"

TOOLCHAIN_SCRIPT_PATH = "comm/taskcluster/scripts"


comm_toolchain_run_schema = toolchain_run_schema.extend(
    {
        Required("using"): "comm-toolchain-script",
    }
)


def get_digest_data(config, run, taskdesc):
    """
    Copied from taskgraph.transforms.job.toolchain, with minor
    modifications to support the required script path.
    """
    files = list(run.pop("resources", []))
    # This file
    files.append("comm/taskcluster/comm_taskgraph/transforms/job/toolchain.py")
    # The script
    files.append("{}/{}".format(TOOLCHAIN_SCRIPT_PATH, run["script"]))
    # Tooltool manifest if any is defined:
    tooltool_manifest = taskdesc["worker"]["env"].get("TOOLTOOL_MANIFEST")
    if tooltool_manifest:
        files.append(tooltool_manifest)

    # Accumulate dependency hashes for index generation.
    data = [hash_paths(GECKO, files)]

    # If the task uses an in-tree docker image, we want it to influence
    # the index path as well. Ideally, the content of the docker image itself
    # should have an influence, but at the moment, we can't get that
    # information here. So use the docker image name as a proxy. Not a lot of
    # changes to docker images actually have an impact on the resulting
    # toolchain artifact, so we'll just rely on such important changes to be
    # accompanied with a docker image name change.
    image = taskdesc["worker"].get("docker-image", {}).get("in-tree")
    if image:
        data.append(image)

    # Likewise script arguments should influence the index.
    args = run.get("arguments")
    if args:
        data.extend(args)
    return data


@run_job_using(
    "docker-worker",
    "comm-toolchain-script",
    schema=comm_toolchain_run_schema,
    defaults=toolchain_defaults,
)
def docker_worker_toolchain(config, job, taskdesc):
    run = job["run"]
    run["comm-checkout"] = True

    worker = taskdesc["worker"] = job["worker"]
    worker["chain-of-trust"] = True

    # If the task doesn't have a docker-image, set a default
    worker.setdefault("docker-image", {"in-tree": "deb8-toolchain-build"})

    # Allow the job to specify where artifacts come from, but add
    # public/build if it's not there already.
    artifacts = worker.setdefault("artifacts", [])
    if not any(artifact.get("name") == "public/build" for artifact in artifacts):
        docker_worker_add_artifacts(config, job, taskdesc)

    # Toolchain checkouts don't live under {workdir}/checkouts
    workspace = "{workdir}/workspace/build".format(**run)
    gecko_path = "{}/src".format(workspace)

    env = worker["env"]
    env.update(
        {
            "MOZ_BUILD_DATE": config.params["moz_build_date"],
            "MOZ_SCM_LEVEL": config.params["level"],
            "GECKO_PATH": gecko_path,
        }
    )

    attributes = taskdesc.setdefault("attributes", {})
    attributes["toolchain-artifact"] = run.pop("toolchain-artifact")
    if "toolchain-alias" in run:
        attributes["toolchain-alias"] = run.pop("toolchain-alias")

    if not taskgraph.fast:
        name = taskdesc["label"].replace("{}-".format(config.kind), "", 1)
        taskdesc["cache"] = {
            "type": CACHE_TYPE,
            "name": name,
            "digest-data": get_digest_data(config, run, taskdesc),
        }

    run["using"] = "run-task"
    run["cwd"] = run["workdir"]
    run["command"] = [
        "workspace/build/src/{}/{}".format(TOOLCHAIN_SCRIPT_PATH, run.pop("script"))
    ] + run.pop("arguments", [])

    configure_taskdesc_for_run(config, job, taskdesc, worker["implementation"])
