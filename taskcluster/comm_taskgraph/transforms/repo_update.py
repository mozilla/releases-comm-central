#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at https://mozilla.org/MPL/2.0/.
"""
tb-rust vendor things.
"""

import logging

from taskgraph.transforms.base import TransformSequence
from taskgraph.util.schema import resolve_keyed_by
from taskgraph.util.taskcluster import find_task_id

from taskcluster import TaskclusterRestFailure

logger = logging.getLogger(__name__)

transforms = TransformSequence()


@transforms.add
def resolve_keys(config, jobs):
    for job in jobs:
        for item in ("ssh-key-secret", "phab-token-secret", "routes", "scopes"):
            resolve_keyed_by(job, item, item, **{"level": str(config.params["level"])})
        yield job


@transforms.add
def update_scopes(config, jobs):
    for job in jobs:
        for item in ("ssh-key-secret", "phab-token-secret"):
            secret = job.pop(item)
            if secret:
                job.setdefault("scopes", []).append(f"secrets:get:{secret}")
        yield job


@transforms.add
def update_routes(config, jobs):
    for job in jobs:
        for key, route in enumerate(job.get("routes", [])):
            if route.startswith("notify.email"):
                job["routes"][key] = route.format(owner=config.params["owner"])
        for key, scope in enumerate(job.get("scopes", [])):
            if scope.startswith("notify:email"):
                job["scopes"][key] = scope.format(owner=config.params["owner"])
        yield job


CRON_TARGET_TASKS_METHODS = {
    "tb-rust-vendor": "tb_rust_vendor_check",
    "third-party-updatebot": "third_party_updatebot",
}


@transforms.add
def add_artifact_fetches(config, jobs):
    project = config.params["project"]
    target_tasks_method = config.params["target_tasks_method"]
    for job in jobs:
        job_name = job["index"]["job-name"]
        if CRON_TARGET_TASKS_METHODS.get(job_name) == target_tasks_method:
            index_path = f"comm.v2.{project}.latest.thunderbird.{job_name}"
            try:
                job["worker"]["env"]["PREVIOUS_TASK_ID"] = find_task_id(index_path)
            except TaskclusterRestFailure as e:
                if e.status_code != 404:
                    raise
                logger.info(f"No previous task indexed at {index_path}")
        yield job
