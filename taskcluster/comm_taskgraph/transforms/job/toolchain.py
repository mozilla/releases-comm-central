# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""
Support for running toolchain-building jobs via dedicated scripts in comm-central
"""

import os.path

import taskgraph
import taskgraph.util.path as util_path
from taskgraph.util.schema import resolve_keyed_by
from voluptuous import Any, Optional, Required

from gecko_taskgraph import GECKO
from gecko_taskgraph.transforms.job import configure_taskdesc_for_run, run_job_using
from gecko_taskgraph.transforms.job.common import docker_worker_add_artifacts
from gecko_taskgraph.transforms.job.toolchain import toolchain_defaults, toolchain_run_schema
from gecko_taskgraph.util.attributes import RELEASE_PROJECTS
from gecko_taskgraph.util.hash import hash_paths as hash_paths_gecko_root

from comm_taskgraph.util.hash import hash_paths_extended

CACHE_TYPE = "toolchains.v3"

TOOLCHAIN_SCRIPT_PATH = "comm/taskcluster/scripts"


comm_toolchain_run_schema = toolchain_run_schema.extend(
    {
        Required("using"): Any("comm-toolchain-script"),
        Optional("script"): str,
    }
)


def hash_paths(*args):
    """
    Helper function while the single repository project is in development.
    The extended version of hash_paths found in comm_taskgraph.util.hash is
    not necessary (and does not work) with single-repo. This is a wrapper
    function to pick the right function based on the presence of a comm/.hg
    directory.
    """
    comm_hg_path = util_path.join(GECKO, "comm", ".hg")
    if os.path.exists(comm_hg_path):
        return hash_paths_extended(*args)
    else:
        return hash_paths_gecko_root(*args)


def get_digest_data(config, run, taskdesc):
    """
    Copied from gecko_taskgraph.transforms.job.toolchain, with minor
    modifications to support the required script path.
    """
    files = list(run.pop("resources", []))
    # This file
    files.append("comm/taskcluster/comm_taskgraph/transforms/job/toolchain.py")
    # The script
    if "script" in run:
        files.append("{}/{}".format(TOOLCHAIN_SCRIPT_PATH, run["script"]))
    # Tooltool manifest if any is defined:
    tooltool_manifest = taskdesc["worker"]["env"].get("TOOLTOOL_MANIFEST")
    if tooltool_manifest:
        files.append(tooltool_manifest)

    # Accumulate dependency hashes for index generation.
    data = [hash_paths(GECKO, files)]

    data.append(taskdesc["attributes"]["toolchain-artifact"])

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

    if taskdesc["attributes"].get("rebuild-on-release"):
        # Add whether this is a release branch or not
        data.append(str(config.params["project"] in RELEASE_PROJECTS))
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
    worker.setdefault("docker-image", {"in-tree": "deb12-toolchain-build"})

    # Toolchain checkouts don't live under {workdir}/checkouts
    workspace = "{workdir}/workspace/build".format(**run)
    gecko_path = "{}/src".format(workspace)

    env = worker.setdefault("env", {})
    env.update(
        {
            "MOZ_BUILD_DATE": config.params["moz_build_date"],
            "MOZ_SCM_LEVEL": config.params["level"],
            "GECKO_PATH": gecko_path,
            "TOOLCHAIN_ARTIFACT": run["toolchain-artifact"],
        }
    )

    attributes = taskdesc.setdefault("attributes", {})
    attributes["toolchain-artifact"] = run.pop("toolchain-artifact")
    toolchain_artifact = attributes["toolchain-artifact"]
    if not toolchain_artifact.startswith("public/build/"):
        attributes["artifact_prefix"] = os.path.dirname(toolchain_artifact)

    resolve_keyed_by(
        run,
        "toolchain-alias",
        item_name=taskdesc["label"],
        project=config.params["project"],
    )
    alias = run.pop("toolchain-alias", None)
    if alias:
        attributes["toolchain-alias"] = alias
    if "toolchain-env" in run:
        attributes["toolchain-env"] = run.pop("toolchain-env")

    # Allow the job to specify where artifacts come from, but add
    # public/build if it's not there already.
    artifacts = worker.setdefault("artifacts", [])
    if not artifacts:
        docker_worker_add_artifacts(config, job, taskdesc)

    digest_data = get_digest_data(config, run, taskdesc)

    if job.get("attributes", {}).get("cached_task") is not False and not taskgraph.fast:
        name = taskdesc["label"].replace(f"{config.kind}-", "", 1)
        taskdesc["cache"] = {
            "type": CACHE_TYPE,
            "name": name,
            "digest-data": digest_data,
        }

    run["using"] = "run-task"
    run["cwd"] = run["workdir"]
    run["command"] = [
        "workspace/build/src/{}/{}".format(TOOLCHAIN_SCRIPT_PATH, run.pop("script"))
    ] + run.pop("arguments", [])

    configure_taskdesc_for_run(config, job, taskdesc, worker["implementation"])
