# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""
Transform the release-push-langpacks task into an actual task description.
"""

import json
import os
from contextlib import contextmanager

from mozilla_version.gecko import ThunderbirdVersion
from taskgraph.transforms.base import TransformSequence
from taskgraph.util.dependencies import get_primary_dependency
from taskgraph.util.schema import Schema, optionally_keyed_by, resolve_keyed_by, taskref_or_string
from taskgraph.util.treeherder import inherit_treeherder_from_dep
from voluptuous import Any, Optional, Required

from gecko_taskgraph.transforms.task import task_description_schema
from gecko_taskgraph.util.attributes import copy_attributes_from_dependent_job, release_level
from mozbuild.action.langpack_manifest import get_version_maybe_buildid

transforms = TransformSequence()


PUSH_LANGPACK_SCOPE = (
    "secrets:get:project/comm/thunderbird/releng/build/level-{level}/atn_langpack"
)

langpack_push_description_schema = Schema(
    {
        Optional("dependencies"): task_description_schema["dependencies"],
        Optional("task-from"): task_description_schema["task-from"],
        Required("worker"): {
            Required("env"): {str: taskref_or_string},
            Required("channel"): optionally_keyed_by(
                "project", "platform", Any("listed", "unlisted")
            ),
            Required("command"): [taskref_or_string],
        },
        Required("run-on-projects"): [],
        Required("shipping-phase"): task_description_schema["shipping-phase"],
        Required("shipping-product"): task_description_schema["shipping-product"],
    }
)


@transforms.add
def remove_name(config, jobs):
    for job in jobs:
        if "name" in job:
            del job["name"]
        yield job


@transforms.add
def drop_task(config, tasks):
    """Only run push_langpacks under certain conditions.

    - comm-beta: Always run as langpacks are always updated
    - comm-release: Run on major version bump (eg 130.0 but not 130.0.1)
    - comm-esrXX: Run on major version bump and minor version bump
        (128.0esr not 128.0.1esr and 128.1.0esr not 128.1.1esr)

    Makes heavy use of mozilla_version to parse the version number, determine
    its type (beta, release, esr) and separate out the subvalues,
    """
    version = ThunderbirdVersion.parse(config.params.get("version"))

    for task in tasks:
        # Do not attempt to run when staging releases on try-comm-central
        if release_level(config.params["project"]) != "production":
            continue

        if version.is_beta:
            yield task
        elif version.is_release and version.is_major:
            yield task
        elif version.is_esr:
            if version.major_number == 0 and version.patch_number in (None, 0):
                yield task
            elif version.minor_number > 0 and version.patch_number == 0:
                yield task


@transforms.add
def make_task_description(config, jobs):
    for job in jobs:
        dep_job = get_primary_dependency(config, job)
        assert dep_job

        label = "push-langpacks-{}".format(dep_job.label)
        job["label"] = label

        job["attributes"] = copy_attributes_from_dependent_job(dep_job)
        job["attributes"]["chunk_locales"] = dep_job.attributes.get("chunk_locales", ["en-US"])

        job["description"] = "Sends langpacks to ATN"

        job["scopes"] = [PUSH_LANGPACK_SCOPE.format(level=config.params["level"])]

        resolve_keyed_by(
            job,
            "worker.channel",
            item_name=job["label"],
            project=config.params["project"],
            platform=dep_job.attributes["build_platform"],
        )

        job["worker-type"] = "b-linux-gcp"
        job["worker"].update(
            {
                "os": "linux",
                "implementation": "docker-worker",
                "docker-image": {"in-tree": "tb-atn"},
                "max-run-time": 1800,
            }
        )

        treeherder = inherit_treeherder_from_dep(job, dep_job)
        treeherder.setdefault(
            "symbol", "langpack(P{})".format(job["attributes"].get("l10n_chunk", ""))
        )

        job["description"] = job["description"].format(
            locales="/".join(job["attributes"]["chunk_locales"]),
        )

        job["dependencies"] = {dep_job.kind: dep_job.label}
        job["treeherder"] = treeherder

        yield job


@transforms.add
def filter_out_macos_jobs_but_mac_only_locales(config, jobs):
    for job in jobs:
        build_platform = job["attributes"].get("build_platform")

        if build_platform == "linux64-shippable":
            yield job
        elif (
            build_platform == "macosx64-shippable"
            and "ja-JP-mac" in job["attributes"]["chunk_locales"]
        ):
            # Other locales of the same job shouldn't be processed
            job["attributes"]["chunk_locales"] = ["ja-JP-mac"]
            job["label"] = job["label"].replace(
                # Guard against a chunk 10 or chunk 1 (latter on try) weird munging
                "-{}/".format(job["attributes"]["l10n_chunk"]),
                "-ja-JP-mac/",
            )
            yield job


def generate_upstream_artifacts(upstream_task_ref, locales):
    return [
        {
            "task": upstream_task_ref,
            "extract": False,
            "dest": f"{locale}",
            "artifact": "public/build{locale}/target.langpack.xpi".format(
                locale="" if locale == "en-US" else "/" + locale
            ),
        }
        for locale in locales
    ]


@transforms.add
def make_fetches(config, jobs):
    for job in jobs:
        upstream_task_ref = get_upstream_task_ref(job, expected_kinds=("build", "shippable-l10n"))

        worker = job.setdefault("worker", {})
        worker["taskcluster-proxy"] = True

        env = worker.setdefault("env", {})

        job_fetches = generate_upstream_artifacts(
            upstream_task_ref, job["attributes"]["chunk_locales"]
        )
        env["MOZ_FETCHES"] = {
            "task-reference": json.dumps(
                sorted(job_fetches, key=lambda x: sorted(x.items())), sort_keys=True
            )
        }
        env["MOZ_SCM_LEVEL"] = config.params["level"]

        yield job


def get_upstream_task_ref(job, expected_kinds):
    upstream_tasks = [
        job_kind for job_kind in job["dependencies"].keys() if job_kind in expected_kinds
    ]

    if len(upstream_tasks) > 1:
        raise Exception("Only one dependency expected")

    return f"<{upstream_tasks[0]}>"


@contextmanager
def environment(key, value):
    """Set an environment variable in a context"""
    old_value = None
    if key in os.environ:
        old_value = os.environ[key]
    os.environ[key] = value
    try:
        yield True
    finally:
        if old_value is None:
            del os.environ[key]
        else:
            os.environ[key] = old_value


@transforms.add
def set_env(config, jobs):
    buildid = config.params["moz_build_date"]
    app_version = config.params.get("app_version")

    with environment("MOZ_BUILD_DATE", buildid):
        langpack_version = get_version_maybe_buildid(app_version)

    for job in jobs:
        job["worker"].get("env", {}).update(
            {
                "LANGPACK_VERSION": langpack_version,
                "LOCALES": json.dumps(job["attributes"]["chunk_locales"]),
                "MOZ_FETCHES_DIR": "fetches",
                "ATN_CHANNEL": job["worker"].pop("channel"),
            }
        )

        yield job
