# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""
Transform the release-push-langpacks task into an actual task description.
"""

import json
import os
from contextlib import contextmanager

from taskgraph.transforms.base import TransformSequence
from taskgraph.util.schema import optionally_keyed_by, resolve_keyed_by, taskref_or_string
from taskgraph.util.treeherder import inherit_treeherder_from_dep
from voluptuous import Any, Optional, Required

from gecko_taskgraph.loader.single_dep import schema
from gecko_taskgraph.transforms.task import task_description_schema
from gecko_taskgraph.util.attributes import (
    copy_attributes_from_dependent_job,
    release_level,
)
from mozbuild.action.langpack_manifest import get_version_maybe_buildid

transforms = TransformSequence()

langpack_push_description_schema = schema.extend(
    {
        Required("label"): str,
        Required("description"): str,
        Required("worker-type"): optionally_keyed_by("release-level", str),
        Required("worker"): {
            Required("docker-image"): {"in-tree": str},
            Required("implementation"): "docker-worker",
            Required("os"): "linux",
            Optional("max-run-time"): int,
            Required("env"): {str: taskref_or_string},
            Required("channel"): optionally_keyed_by(
                "project", "platform", Any("listed", "unlisted")
            ),
            Required("command"): [taskref_or_string],
        },
        Required("run-on-projects"): [],
        Required("scopes"): optionally_keyed_by("release-level", [str]),
        Required("shipping-phase"): task_description_schema["shipping-phase"],
        Required("shipping-product"): task_description_schema["shipping-product"],
    }
)


@transforms.add
def set_label(config, jobs):
    for job in jobs:
        label = "push-langpacks-{}".format(job["primary-dependency"].label)
        job["label"] = label

        yield job


transforms.add_validate(langpack_push_description_schema)


@transforms.add
def resolve_keys(config, jobs):
    for job in jobs:
        resolve_keyed_by(
            job,
            "worker-type",
            item_name=job["label"],
            **{"release-level": release_level(config.params["project"])},
        )
        resolve_keyed_by(
            job,
            "scopes",
            item_name=job["label"],
            **{"release-level": release_level(config.params["project"])},
        )
        resolve_keyed_by(
            job,
            "worker.channel",
            item_name=job["label"],
            platform=job["primary-dependency"].attributes["build_platform"],
        )

        yield job


@transforms.add
def copy_attributes(config, jobs):
    for job in jobs:
        dep_job = job["primary-dependency"]
        job["attributes"] = copy_attributes_from_dependent_job(dep_job)
        job["attributes"]["chunk_locales"] = dep_job.attributes.get("chunk_locales", ["en-US"])

        yield job


@transforms.add
def filter_out_macos_jobs_but_mac_only_locales(config, jobs):
    for job in jobs:
        build_platform = job["primary-dependency"].attributes.get("build_platform")

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


@transforms.add
def make_task_description(config, jobs):
    for job in jobs:
        dep_job = job["primary-dependency"]

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
                "ATN_CHANNEL": job["worker"].get("channel"),
            }
        )

        yield job


@transforms.add
def strip_unused_data(config, jobs):
    for job in jobs:
        del job["primary-dependency"]
        del job["worker"]["channel"]

        yield job
