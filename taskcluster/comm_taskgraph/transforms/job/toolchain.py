# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""
Support for running toolchain-building jobs via dedicated scripts in comm-central
"""

from __future__ import absolute_import, print_function, unicode_literals

import os.path
import json
from six import text_type, ensure_text
from voluptuous import Any, Optional, Required
import mozpack.path as mozpath
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

from taskgraph.util import taskcluster
from taskgraph.util.hash import hash_paths as hash_paths_gecko_root
from comm_taskgraph.util.hash import hash_paths_extended
from taskgraph import GECKO
import taskgraph

CACHE_TYPE = "toolchains.v3"

TOOLCHAIN_SCRIPT_PATH = "comm/taskcluster/scripts"


comm_toolchain_run_schema = toolchain_run_schema.extend(
    {
        Required("using"): Any("comm-toolchain-script", "macos-sdk-fetch"),
        Optional("script"): text_type,
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
    comm_hg_path = mozpath.join(GECKO, "comm", ".hg")
    if os.path.exists(comm_hg_path):
        return hash_paths_extended(*args)
    else:
        return hash_paths_gecko_root(*args)


def get_digest_data(config, run, taskdesc):
    """
    Copied from taskgraph.transforms.job.toolchain, with minor
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
    worker.setdefault("docker-image", {"in-tree": "deb10-toolchain-build"})

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


@run_job_using(
    "docker-worker",
    "macos-sdk-fetch",
    schema=comm_toolchain_run_schema,
    defaults=toolchain_defaults,
)
def docker_macos_sdk_fetch(config, job, taskdesc):
    """
    Facilitates downloading the macOS-11 SDK from the Firefox private artifact
    build. This gets around the requirement of using a macOS worker with Xcode
    installed to create the SDK tar file and instead downloads one that was
    already generated.
    Previously, toolchain artifacts with encumbered licenses such as the macOS
    SDK were made available to build jobs as private tooltool artifacts.

    There is a possibility of a race condition where the an SDK has been updated
    but the job is not completed. In this case, the previous version would be
    found when the Thunderbird decision task runs and that will be used for the
    build jobs that require it. Once the Firefox SDk build job completes, the
    index is updated and the next Thunderbird build will use it. As the SDK itself
    does not get updated very often, this should not pose a problem.
    """
    run = job["run"]

    worker = taskdesc["worker"] = job["worker"]
    worker["chain-of-trust"] = True

    # If the task doesn't have a docker-image, set a default
    worker.setdefault("docker-image", {"in-tree": "deb10-toolchain-build"})

    # Allow the job to specify where artifacts come from, but add
    # public/build if it's not there already.
    artifacts = worker.setdefault("artifacts", [])
    if not any(artifact.get("name") == "public/build" for artifact in artifacts):
        docker_worker_add_artifacts(config, job, taskdesc)

    upload_dir = "{workdir}/artifacts".format(**run)

    attributes = taskdesc.setdefault("attributes", {})
    # Level 1 builds can use level 2 & 3 toolchains if available
    sdk_task_id = None
    for level in reversed(range(int(config.params["level"]), 4)):
        gecko_index = attributes["gecko_index"].format(level=level)
        try:
            sdk_task_id = taskcluster.find_task_id(gecko_index)
            break
        except KeyError:
            continue
    if sdk_task_id is None:
        raise KeyError("toolchain index path {} not found".format(gecko_index))

    # Sets the MOZ_FETCHES environment variable with the task id and artifact
    # path of the gecko artifact. This bypasses the usual setup done in
    # taskgraph/transforms/job/__init__.py.
    moz_fetches = {
        "task-reference": ensure_text(
            json.dumps(
                [
                    {
                        "artifact": attributes["gecko_artifact_path"],
                        "extract": False,
                        "task": sdk_task_id,
                    }
                ]
            )
        )
    }

    # fetch-content dowmloads files to MOZ_FETCHES, so we set it to UPLOAD_DIR
    # so that it's found by the automatic artifact upload done at the end of
    # the "build".
    env = worker["env"]
    env.update(
        {
            "MOZ_SCM_LEVEL": config.params["level"],
            "MOZ_FETCHES": moz_fetches,
            "MOZ_FETCHES_DIR": upload_dir,
        }
    )

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
    run["command"] = ["/builds/worker/bin/fetch-content", "task-artifacts"]

    configure_taskdesc_for_run(config, job, taskdesc, worker["implementation"])
