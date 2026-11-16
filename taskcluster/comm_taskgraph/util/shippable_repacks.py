#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Schedule the Thunderbird Enterprise shippable builds and repacks at most
once a day per branch.

TODO: Remove this module once Thunderbird Enterprise schedules its repacks
through the release promotion action, as Firefox Enterprise does.

Until then, nothing asks for the repacks: every level 3 push schedules the
shippable builds, the repacks made from them and their OCI uploads, which is
costly and races between pushes. The first push of each UTC day on a branch
schedules them, and marks it in the index (see
`get_shippable_repacks_produced_index`). Later pushes on that day find the
entry and skip them.

The entry is inserted as soon as the decision task chooses to schedule them,
long before they are created, let alone completed: despite its name, it means
"scheduled". This leaves only a short window for two decision tasks to both
schedule them, as the index offers no atomic way to claim an entry.

The entry points to the decision task that inserted it, and is ignored when that
task failed, so the next push schedules them again. To schedule them again
anyway, e.g. to ship a fix the same day, delete the entry with
`index.deleteTask`, which requires the
`index:delete-task:<index path>` scope, then push or rerun the decision task.
"""

import logging
import os
import time
from types import SimpleNamespace

from taskcluster.exceptions import TaskclusterRestFailure
from taskgraph.util.taskcluster import find_task_id, get_taskcluster_client, state_task

logger = logging.getLogger(__name__)

SHIPPABLE_REPACKS_PRODUCED_EXPIRY = 14 * 24 * 3600


def get_shippable_repacks_produced_index(parameters, graph_config):
    """The index path marking that the shippable builds and repacks of the
    branch were scheduled on the UTC day of the push, e.g.
    `enterprise.v2.enterprise-firefox.branch.enterprise-main.thunderbird.`
    `shippable-repacks-produced.2026.11.04`.

    It lives under the repository the push came from, not under the
    `enterprise-thunderbird` project: Thunderbird Enterprise is built from
    enterprise-firefox pushes, whose decision tasks may only insert index
    entries under `<trust-domain>.v2.enterprise-firefox.*`.
    """
    # Importing the task transforms first runs into an import cycle with the
    # job transforms.
    import gecko_taskgraph.transforms.job  # noqa: F401
    from gecko_taskgraph.transforms.task import get_head_ref_index

    repository = parameters["base_repository"].rstrip("/").split("/")[-1]
    # Same pull request and branch namespaces as the task routes.
    if parameters["tasks_for"].startswith("github-pull-request"):
        repository += "-pr"
    head_ref = get_head_ref_index(SimpleNamespace(params=parameters)).removeprefix(".")
    parts = [
        graph_config["trust-domain"],
        "v2",
        repository,
        head_ref,
        "thunderbird",
        "shippable-repacks-produced",
        time.strftime("%Y.%m.%d", time.gmtime(parameters["build_date"])),
    ]
    return ".".join(part for part in parts if part)


def _is_gated(parameters):
    return (
        "enterprise" in parameters["project"]
        and parameters["level"] == "3"
        and parameters["tasks_for"] == "github-push"
    )


def should_schedule_shippable_repacks(parameters, graph_config):
    """Whether this decision task schedules the shippable builds and repacks.

    When it does, and they are gated, mark it in the index right away.
    """
    decision_task_id = os.environ.get("TASK_ID")
    if not _is_gated(parameters) or not decision_task_id:
        return True

    index_path = get_shippable_repacks_produced_index(parameters, graph_config)
    try:
        task_id = find_task_id(index_path)
    except TaskclusterRestFailure:
        task_id = None

    # A rerun of this decision task finds its own entry.
    if task_id and task_id != decision_task_id:
        if state_task(task_id) not in ("failed", "exception"):
            logger.info(
                f"Shippable builds and repacks already scheduled by {task_id} "
                f"({index_path}), skipping them."
            )
            return False
        logger.info(f"Ignoring {index_path}: {task_id} did not complete.")

    build_date = parameters["build_date"]
    expires = time.strftime(
        "%Y-%m-%dT%H:%M:%S.000Z",
        time.gmtime(build_date + SHIPPABLE_REPACKS_PRODUCED_EXPIRY),
    )
    get_taskcluster_client("index").insertTask(
        index_path,
        {
            "taskId": decision_task_id,
            "rank": build_date,
            "data": {},
            "expires": expires,
        },
    )
    logger.info(f"Scheduling shippable builds and repacks, indexed at {index_path}.")
    return True


def filter_out_shippable_repacks(full_task_graph, parameters, labels):
    """Drop the shippable builds and every task made from them, down to the
    repacks and their OCI uploads, when this decision task must not schedule
    them."""
    if parameters.get("enterprise_schedule_shippable_repacks", True):
        return labels

    def is_shippable(task):
        return task.attributes.get("shippable") or "-enterprise-shippable" in (
            task.attributes.get("build_platform") or ""
        )

    shippable = {l for l, t in full_task_graph.tasks.items() if is_shippable(t)}
    dropped = full_task_graph.graph.transitive_closure(shippable, reverse=True).nodes
    return [l for l in labels if l not in dropped]
